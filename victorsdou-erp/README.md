# VictorOS ERP — Victorsdou Bakery

Production-grade ERP system for Victorsdou Bakery. API-first, modular monolith architecture designed to grow into microservices.

## Quick Start

### Prerequisites
- Node.js 22+
- Docker & Docker Compose
- npm 10+

### 1. Environment Setup
```bash
cp .env.example .env
# Edit .env — fill in JWT keys, Nubefact token, company RUC
```

**Generate RSA keys for JWT:**
```bash
openssl genrsa -out private.pem 2048
openssl rsa -in private.pem -pubout -out public.pem
# Paste PEM contents into .env (replace newlines with \n)
awk 'NF {sub(/\r/, ""); printf "%s\\n",$0;}' private.pem
awk 'NF {sub(/\r/, ""); printf "%s\\n",$0;}' public.pem
```

### 2. Start Infrastructure
```bash
docker compose up postgres redis -d
```

### 3. Install & Migrate
```bash
npm install
npm run db:migrate     # Apply Prisma migrations
npm run db:seed        # Seed PCGE accounts, users, config
```

### 4. Run Dev Server
```bash
npm run dev
# API: http://localhost:3000
# Docs: http://localhost:3000/docs
```

---

## Architecture

```
src/
├── app.ts              # Fastify app setup (plugins, routes)
├── server.ts           # Entry point + graceful shutdown
├── config/             # Environment validation (Zod)
├── lib/
│   ├── prisma.ts       # Prisma singleton
│   ├── redis.ts        # Redis client + cache helpers
│   └── event-bus.ts    # In-process domain event bus
├── middleware/
│   ├── auth.ts         # JWT verification (RS256) + guards
│   ├── rbac.ts         # Role-based access control
│   └── audit.ts        # Immutable audit log
├── modules/
│   ├── auth/           # Login · Refresh · Logout · MFA
│   ├── inventory/      # WAC costing · Movements · Reorder
│   ├── production/     # BOM · Production Orders · Waste
│   ├── procurement/    # POs · GRN · 3-way match
│   ├── catalog/        # Products · Categories · Pricing
│   ├── customers/      # B2B/B2C CRM · Price Agreements
│   ├── sales/          # Order lifecycle · Pricing engine
│   ├── invoicing/      # Factura · Boleta · Nubefact CDR
│   ├── accounting/     # GL · P&L · AR/AP Aging · PCGE
│   ├── delivery/       # Routes · Jobs · Incidents
│   ├── payroll/        # Planilla · AFP/ONP · Essalud
│   └── ai/             # Forecasts · Production planning
├── types/              # Shared TypeScript types
prisma/
└── schema.prisma       # Full PostgreSQL schema (25+ entities)
tests/
├── unit/               # Pure logic tests (WAC, IGV, payroll)
└── integration/        # Full API tests with testcontainers
```

---

## Key Design Decisions

| Decision | Choice | Why |
|---|---|---|
| Architecture | Modular Monolith | Fast MVP delivery; domain boundaries ready for service extraction |
| ORM | Prisma 5 | Type-safe, great DX, auto-migrations, strong PostgreSQL support |
| Auth | JWT RS256 | Asymmetric keys; AI service can verify without shared secret |
| Costing | WAC (Weighted Average Cost) | SUNAT-compliant; simpler for high-volume bakery ingredients |
| Invoicing | Nubefact PSE | Handles SUNAT submission, CDR, and contingency mode |
| Event Bus | In-process EventEmitter | Zero infra overhead for MVP; swap to BullMQ adapter in Phase 2 |

---

## API Reference

Base URL: `http://localhost:3000/v1/`
Swagger UI: `http://localhost:3000/docs`

### Auth
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/v1/auth/login` | Email + password + TOTP |
| POST | `/v1/auth/refresh` | Refresh access token |
| POST | `/v1/auth/logout` | Revoke session |
| GET  | `/v1/auth/me` | Current user |

### Core Resources
All module routes follow: `GET /v1/{module}`, `POST /v1/{module}`, `PATCH /v1/{module}/:id`

See Swagger at `/docs` for full endpoint list and example payloads.

---

## Available npm Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start dev server with hot reload |
| `npm run build` | Compile TypeScript |
| `npm run typecheck` | Type check without emit |
| `npm run lint` | ESLint |
| `npm test` | Run all tests |
| `npm run test:unit` | Unit tests only |
| `npm run test:integration` | Integration tests with real DB |
| `npm run test:coverage` | Tests with coverage report |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:migrate:deploy` | Deploy migrations (production) |
| `npm run db:seed` | Seed initial data |
| `npm run db:studio` | Open Prisma Studio |

---

## Peru Compliance

- **IGV**: 18% applied on all taxable sales; net IGV tracked via accounts 4011/4012
- **PCGE**: Full chart of accounts seeded on `npm run db:seed`
- **Nubefact**: Factura (01), Boleta (03), Nota de Crédito (07), Nota de Débito (08), Guía de Remisión (09)
- **Planilla**: AFP/ONP, Essalud (9%), 5ta Categoría, CTS, Gratificaciones, Vacaciones
- **PLE**: Registro de Ventas (14.1) and Registro de Compras (8.1) — Phase 2

---

## Default Seed Users

| Email | Password | Role |
|-------|----------|------|
| admin@victorsdou.pe | Admin@Victorsdou2026! | SUPER_ADMIN |
| finanzas@victorsdou.pe | Finance@Victorsdou2026! | FINANCE_MGR |
| operaciones@victorsdou.pe | Ops@Victorsdou2026! | OPS_MGR |

**Change all passwords immediately after first login in production.**
