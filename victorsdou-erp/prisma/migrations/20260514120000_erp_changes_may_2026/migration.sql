-- ============================================================
-- ERP changes — May 2026 (Producto + Inventario + Producción)
-- ============================================================
-- All statements are idempotent so partial-apply recovery is safe.

-- ── 1. New enums ──────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "ProductLinea" AS ENUM (
    'MOLDE', 'HOGAZA', 'VARIOS', 'ESTANDAR',
    'SALADOS', 'DULCES', 'GALLETAS', 'HOJALDRES', 'POSTRES'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "RawMaterialFamily" AS ENUM (
    'HARINA', 'SEMILLAS', 'LACTEOS', 'ENDULZANTES',
    'GRASAS', 'ESPECIAS', 'ADITIVOS', 'COBERTURAS_RELLENOS'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 2. Product: linea + running avg cost for finished goods ──
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "linea" "ProductLinea";
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "avgCostPen" DECIMAL(14,6) DEFAULT 0;

-- ── 3. Ingredient: raw-material family ────────────────────────
ALTER TABLE "ingredients" ADD COLUMN IF NOT EXISTS "rawFamily" "RawMaterialFamily";

-- ── 4. Batches: capture production date for finished/intermediate ──
ALTER TABLE "batches" ADD COLUMN IF NOT EXISTS "productionDate" TIMESTAMP(3);

-- Make supplierLotNo behave like a mandatory user-facing lot code at the
-- application layer (kept nullable in DB for legacy rows).

-- ── 5. StockMovement: link batch explicitly when applicable ───
-- batchId already exists; no change needed.

-- ── 6. OverheadConfig: single-row table for the global overhead rate ──
CREATE TABLE IF NOT EXISTS "overhead_config" (
  "id"          TEXT NOT NULL PRIMARY KEY,
  "rate"        DECIMAL(5,4) NOT NULL DEFAULT 0.47,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  "updatedBy"   TEXT
);

-- Seed singleton row if missing.
INSERT INTO "overhead_config" (id, rate, "updatedAt")
SELECT 'singleton', 0.47, NOW()
WHERE NOT EXISTS (SELECT 1 FROM "overhead_config" WHERE id = 'singleton');

-- ── 7. Seed the four finished-product categories ─────────────
-- We keep existing categories alive (data may reference them) and just
-- ensure these four exist. The frontend will filter to these for finished
-- products based on a marker in the name.
INSERT INTO "product_categories" (id, name, "isActive")
SELECT gen_random_uuid(), 'Masa Madre', true
WHERE NOT EXISTS (SELECT 1 FROM "product_categories" WHERE name = 'Masa Madre');

INSERT INTO "product_categories" (id, name, "isActive")
SELECT gen_random_uuid(), 'Brioche', true
WHERE NOT EXISTS (SELECT 1 FROM "product_categories" WHERE name = 'Brioche');

INSERT INTO "product_categories" (id, name, "isActive")
SELECT gen_random_uuid(), 'Tradicionales', true
WHERE NOT EXISTS (SELECT 1 FROM "product_categories" WHERE name = 'Tradicionales');

INSERT INTO "product_categories" (id, name, "isActive")
SELECT gen_random_uuid(), 'Boyería', true
WHERE NOT EXISTS (SELECT 1 FROM "product_categories" WHERE name = 'Boyería');

-- ── 8. ProductStockLevel + ProductStockMovement ───────────────
-- The existing StockLevel/StockMovement tables are keyed on ingredientId,
-- so they can't track finished-good stock. We mirror them at the product
-- level instead. WAC for finished goods lives on products.avgCostPen.

CREATE TABLE IF NOT EXISTS "product_stock_levels" (
  "id"             TEXT NOT NULL PRIMARY KEY,
  "productId"      TEXT NOT NULL,
  "warehouseId"    TEXT NOT NULL,
  "qtyOnHand"      DECIMAL(14,4) NOT NULL DEFAULT 0,
  "avgCostPen"     DECIMAL(14,6) NOT NULL DEFAULT 0,
  "lastMovementAt" TIMESTAMP(3),
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT "product_stock_levels_product_warehouse_uq" UNIQUE ("productId", "warehouseId"),
  CONSTRAINT "product_stock_levels_product_fkey"   FOREIGN KEY ("productId")   REFERENCES "products"("id")   ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "product_stock_levels_warehouse_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "product_stock_movements" (
  "id"                 TEXT NOT NULL PRIMARY KEY,
  "type"               "StockMovementType" NOT NULL,
  "productId"          TEXT NOT NULL,
  "warehouseId"        TEXT NOT NULL,
  "qtyIn"              DECIMAL(14,4) NOT NULL DEFAULT 0,
  "qtyOut"             DECIMAL(14,4) NOT NULL DEFAULT 0,
  "unitCostPen"        DECIMAL(14,6) NOT NULL,
  "totalCostPen"       DECIMAL(14,4) NOT NULL,
  "balanceAfter"       DECIMAL(14,4) NOT NULL,
  "productionOrderRef" TEXT,
  "lotNumber"          TEXT,
  "productionDate"     TIMESTAMP(3),
  "expiryDate"         TIMESTAMP(3),
  "notes"              TEXT,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  "createdBy"          TEXT NOT NULL,
  CONSTRAINT "product_stock_movements_product_fkey"   FOREIGN KEY ("productId")   REFERENCES "products"("id")   ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "product_stock_movements_warehouse_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "product_stock_movements_product_createdAt_idx"
  ON "product_stock_movements"("productId", "createdAt");
