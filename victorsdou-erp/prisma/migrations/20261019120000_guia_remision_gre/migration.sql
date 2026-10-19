-- Sprint C (Modificaciones ERP 10/2026): guía de remisión desde Ventas.
-- Campos que pide la GRE remitente de SUNAT + unidad por línea + valores por
-- defecto (partida, vehículo, conductor). IF NOT EXISTS = idempotente.

ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "guiaTransportMode" TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "guiaStartDate" TIMESTAMP(3);
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "guiaOriginUbigeo" TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "guiaDestUbigeo" TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "guiaGrossWeight" DECIMAL(12,3);
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "guiaWeightUnit" TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "guiaPackages" INTEGER;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "guiaDriverDocNo" TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "guiaDriverName" TEXT;

ALTER TABLE "invoice_line_items" ADD COLUMN IF NOT EXISTS "unitCode" TEXT;

CREATE TABLE IF NOT EXISTS "guia_config" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,
    CONSTRAINT "guia_config_pkey" PRIMARY KEY ("id")
);
