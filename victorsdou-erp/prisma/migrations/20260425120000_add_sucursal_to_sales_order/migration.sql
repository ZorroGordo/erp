-- Add sucursalId FK to sales_orders for delivery branch assignment
ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "sucursalId" TEXT;

-- Add isDefaultDelivery flag to sucursales
ALTER TABLE "sucursales" ADD COLUMN IF NOT EXISTS "isDefaultDelivery" BOOLEAN NOT NULL DEFAULT false;

-- Add FK constraint (idempotent via DO/EXCEPTION)
DO $$ BEGIN
  ALTER TABLE "sales_orders"
    ADD CONSTRAINT "sales_orders_sucursalId_fkey"
    FOREIGN KEY ("sucursalId") REFERENCES "sucursales"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
