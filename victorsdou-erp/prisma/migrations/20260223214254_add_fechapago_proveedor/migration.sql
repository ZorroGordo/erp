/*
  Warnings:

  - You are about to drop the column `manualBonuses` on the `payslips` table. All the data in the column will be lost.
  - You are about to drop the column `manualDeductions` on the `payslips` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "comprobantes" ADD COLUMN     "fechaPago" TIMESTAMP(3),
ADD COLUMN     "proveedorId" TEXT;

-- AlterTable
ALTER TABLE "employees" ALTER COLUMN "seguroSalud" DROP DEFAULT;

-- AlterTable
ALTER TABLE "leave_records" ADD COLUMN     "manualBonuses" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "manualDeductions" DECIMAL(65,30) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "payslips" DROP COLUMN "manualBonuses",
DROP COLUMN "manualDeductions",
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "production_plan_suggestions" ADD COLUMN     "manualBonuses" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "manualDeductions" DECIMAL(65,30) NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "comprobantes_fechaPago_idx" ON "comprobantes"("fechaPago");

-- AddForeignKey
ALTER TABLE "comprobantes" ADD CONSTRAINT "comprobantes_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
