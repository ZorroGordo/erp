-- CreateEnum (idempotent)
DO $$ BEGIN
  CREATE TYPE "ProductType" AS ENUM ('RAW_MATERIAL', 'INTERMEDIATE', 'FINISHED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ProductFamily" AS ENUM ('CONGELADO', 'SECO');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add INTERMEDIATE to WarehouseType
ALTER TYPE "WarehouseType" ADD VALUE IF NOT EXISTS 'INTERMEDIATE';

-- Add PRODUCTION_OUTPUT to StockMovementType
ALTER TYPE "StockMovementType" ADD VALUE IF NOT EXISTS 'PRODUCTION_OUTPUT';

-- AlterTable: add productType and family to products (idempotent)
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "productType" "ProductType";
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "family" "ProductFamily";

-- AlterTable: add productType and family to ingredients (idempotent)
ALTER TABLE "ingredients" ADD COLUMN IF NOT EXISTS "productType" "ProductType";
ALTER TABLE "ingredients" ADD COLUMN IF NOT EXISTS "family" "ProductFamily";

-- AlterTable: add productionOrderRef to stock_movements (idempotent)
ALTER TABLE "stock_movements" ADD COLUMN IF NOT EXISTS "productionOrderRef" TEXT;

-- NOTE: Warehouse seeds moved to a separate migration (20260420120001)
-- because ALTER TYPE ADD VALUE must be committed before new values can be
-- used in DML within the same transaction (PostgreSQL restriction).
