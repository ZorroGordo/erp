#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# VictorOS ERP — One-shot bootstrap + dev launcher
# Run this once from the project directory to get everything running.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}[ERP]${NC} $*"; }
success() { echo -e "${GREEN}[✓]${NC} $*"; }
warn()    { echo -e "${YELLOW}[!]${NC} $*"; }
fail()    { echo -e "${RED}[✗]${NC} $*"; exit 1; }

echo ""
echo -e "${CYAN}╔══════════════════════════════════════╗${NC}"
echo -e "${CYAN}║     VictorOS ERP — Dev Bootstrap     ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════╝${NC}"
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── 1. Homebrew ───────────────────────────────────────────────────────────────
if ! command -v brew &>/dev/null; then
  info "Installing Homebrew (you may be asked for your password)..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  # Add brew to PATH for Apple Silicon or Intel
  if [[ -f /opt/homebrew/bin/brew ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  elif [[ -f /usr/local/bin/brew ]]; then
    eval "$(/usr/local/bin/brew shellenv)"
  fi
  success "Homebrew installed"
else
  success "Homebrew already present"
fi

# Ensure brew is on PATH (for new shell sessions)
if [[ -f /opt/homebrew/bin/brew ]]; then
  eval "$(/opt/homebrew/bin/brew shellenv)"
fi

# ── 2. PostgreSQL ─────────────────────────────────────────────────────────────
if ! brew list postgresql@16 &>/dev/null; then
  info "Installing PostgreSQL 16 via Homebrew..."
  brew install postgresql@16
  success "PostgreSQL 16 installed"
else
  success "PostgreSQL 16 already installed"
fi

# Export pg binaries to PATH
PG_BIN="$(brew --prefix postgresql@16)/bin"
export PATH="$PG_BIN:$PATH"

# Start PostgreSQL service
info "Starting PostgreSQL service..."
brew services start postgresql@16
sleep 3  # give it a moment to start

# ── 3. Redis ──────────────────────────────────────────────────────────────────
if ! brew list redis &>/dev/null; then
  info "Installing Redis via Homebrew..."
  brew install redis
  success "Redis installed"
else
  success "Redis already installed"
fi

info "Starting Redis service..."
brew services start redis
sleep 2

# ── 4. Database setup ─────────────────────────────────────────────────────────
info "Setting up database user and schema..."

# Create role if it doesn't exist
psql postgres -tc "SELECT 1 FROM pg_roles WHERE rolname='victorsdou'" | grep -q 1 \
  || psql postgres -c "CREATE ROLE victorsdou WITH LOGIN PASSWORD 'victorsdou2026' CREATEDB;"

# Create database if it doesn't exist
psql postgres -tc "SELECT 1 FROM pg_database WHERE datname='victorsdou_erp'" | grep -q 1 \
  || psql postgres -c "CREATE DATABASE victorsdou_erp OWNER victorsdou;"

success "Database ready"

# ── 5. Node dependencies ──────────────────────────────────────────────────────
info "Installing Node.js dependencies..."
npm install
success "Dependencies installed"

# ── 6. Prisma migrate + seed ──────────────────────────────────────────────────
info "Running database migrations..."
npm run db:migrate

info "Seeding initial data (users, chart of accounts, config)..."
npm run db:seed

success "Database seeded"

# ── 7. Launch dev server ──────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  Everything is ready! Starting server... ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${CYAN}API:${NC}   http://localhost:3000/v1/"
echo -e "  ${CYAN}Docs:${NC}  http://localhost:3000/docs"
echo ""
echo -e "  ${YELLOW}Default logins:${NC}"
echo -e "  admin@victorsdou.pe     /  Admin@Victorsdou2026!  (SUPER_ADMIN)"
echo -e "  finanzas@victorsdou.pe  /  Finance@Victorsdou2026! (FINANCE_MGR)"
echo ""

# Open Swagger UI in 4 seconds (gives the server time to start)
(sleep 5 && open "http://localhost:3000/docs") &

npm run dev
