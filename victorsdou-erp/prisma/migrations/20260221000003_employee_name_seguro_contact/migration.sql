-- Employee name split + seguro
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "nombres"         TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "apellidoPaterno" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "apellidoMaterno" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "seguroSalud"     TEXT DEFAULT 'ESSALUD';

-- Customer contact receives facturas
ALTER TABLE "customer_contacts" ADD COLUMN IF NOT EXISTS "receivesFacturas" BOOLEAN NOT NULL DEFAULT false;
