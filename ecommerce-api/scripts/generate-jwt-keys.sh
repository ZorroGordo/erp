#!/bin/bash
# Generates RS256 key pair and updates .env with base64-encoded keys
# Run: bash scripts/generate-jwt-keys.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env"

echo "Generating RSA-2048 key pair for JWT..."

# Generate keys
openssl genrsa -out /tmp/jwt_private.pem 2048 2>/dev/null
openssl rsa -in /tmp/jwt_private.pem -pubout -out /tmp/jwt_public.pem 2>/dev/null

PRIVATE_KEY_B64=$(base64 -i /tmp/jwt_private.pem | tr -d '\n')
PUBLIC_KEY_B64=$(base64 -i /tmp/jwt_public.pem | tr -d '\n')

# Remove temp files
rm /tmp/jwt_private.pem /tmp/jwt_public.pem

# Update .env
if grep -q "JWT_PRIVATE_KEY=" "$ENV_FILE"; then
  sed -i.bak "s|JWT_PRIVATE_KEY=.*|JWT_PRIVATE_KEY=$PRIVATE_KEY_B64|" "$ENV_FILE"
  sed -i.bak "s|JWT_PUBLIC_KEY=.*|JWT_PUBLIC_KEY=$PUBLIC_KEY_B64|" "$ENV_FILE"
  rm -f "$ENV_FILE.bak"
  echo "✅ JWT keys updated in .env"
else
  echo "JWT_PRIVATE_KEY=$PRIVATE_KEY_B64" >> "$ENV_FILE"
  echo "JWT_PUBLIC_KEY=$PUBLIC_KEY_B64" >> "$ENV_FILE"
  echo "✅ JWT keys appended to .env"
fi
