-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('RAW_MATERIAL', 'INTERMEDIATE', 'FINISHED');

-- CreateEnum
CREATE TYPE "ProductFamily" AS ENUM ('CONGELADO', 'SECO');

-- Add INTERMEDIATE to WarehouseType
ALTER TYPE "WarehouseType" ADD VALUE IF NOT EXISTS 'INTERMEDIATE';

-- Add PRODUCTION_OUTPUT to StockMovementType
ALTER TYPE "StockMovementType" ADD VALUE IF NOT EXISTS 'PRODUCTION_OUTPUT';

-- AlterTable: add productType and family to products
ALTER TABLE "products" ADD COLUMN "productType" "ProductType";
ALTER TABLE "products" ADD COLUMN "family" "ProductFamily";

-- AlterTable: add productType and family to ingredients
ALTER TABLE "ingredients" ADD COLUMN "productType" "ProductType";
ALTER TABLE "ingredients" ADD COLUMN "family" "ProductFamily";

-- AlterTable: add productionOrderRef to stock_movements
ALTER TABLE "stock_movements" ADD COLUMN "productionOrderRef" TEXT;

-- Seed default warehouses (idempotent)
INSERT INTO "warehouses" (id, name, type, "isActive", "createdAt")
SELECT gen_random_uuid(), 'Almacén Materias Primas', 'RAW_MATERIAL', true, now()
WHERE NOT EXISTS (SELECT 1 FROM "warehouses" WHERE type = 'RAW_MATERIAL');

INSERT INTO "warehouses" (id, name, type, "isActive", "createdAt")
SELECT gen_random_uuid(), 'Almacén Productos Intermedios', 'INTERMEDIATE', true, now()
WHERE NOT EXISTS (SELECT 1 FROM "warehouses" WHERE type = 'INTERMEDIATE');

INSERT INTO "warehouses" (id, name, type, "isActive", "createdAt")
SELECT gen_random_uuid(), 'Almacén Productos Terminados', 'FINISHED_GOODS', true, now()
WHERE NOT EXISTS (SELECT 1 FROM "warehouses" WHERE type = 'FINISHED_GOODS');
