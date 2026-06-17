-- CreateEnum
CREATE TYPE "ProductionLine" AS ENUM ('A', 'B', 'C');

-- CreateEnum
CREATE TYPE "ProductionStage" AS ENUM ('DOSIFICADO', 'AMASADO', 'PORCIONADO', 'REPOSO', 'BOLEADO', 'LABRADO', 'FERMENTADO', 'REPOSO_FRIO', 'PREPARACION', 'HORNEADO', 'ENFRIADO', 'ENVASADO');

-- AlterTable
ALTER TABLE "production_orders" ADD COLUMN     "line" "ProductionLine";

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "rawFamily" "RawMaterialFamily";

-- CreateTable
CREATE TABLE "production_stage_logs" (
    "id" TEXT NOT NULL,
    "productionOrderId" TEXT NOT NULL,
    "stage" "ProductionStage" NOT NULL,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "durationSec" INTEGER,
    "quantity" DECIMAL(12,4),
    "leftover" DECIMAL(12,4),
    "notes" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "production_stage_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_reservations" (
    "id" TEXT NOT NULL,
    "productionOrderId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "qty" DECIMAL(14,4) NOT NULL,
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "production_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "production_stage_logs_productionOrderId_idx" ON "production_stage_logs"("productionOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "production_stage_logs_productionOrderId_stage_key" ON "production_stage_logs"("productionOrderId", "stage");

-- CreateIndex
CREATE INDEX "production_reservations_productionOrderId_idx" ON "production_reservations"("productionOrderId");

-- CreateIndex
CREATE INDEX "production_reservations_ingredientId_warehouseId_idx" ON "production_reservations"("ingredientId", "warehouseId");

-- AddForeignKey
ALTER TABLE "production_stage_logs" ADD CONSTRAINT "production_stage_logs_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "production_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_reservations" ADD CONSTRAINT "production_reservations_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "production_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_reservations" ADD CONSTRAINT "production_reservations_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_reservations" ADD CONSTRAINT "production_reservations_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

