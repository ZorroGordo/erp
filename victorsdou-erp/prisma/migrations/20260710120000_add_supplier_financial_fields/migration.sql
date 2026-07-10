-- AlterTable: add CCI, credit limit, payment day and detracción fields to suppliers
ALTER TABLE "suppliers" ADD COLUMN "paymentDayOfMonth" TEXT;
ALTER TABLE "suppliers" ADD COLUMN "cci" TEXT;
ALTER TABLE "suppliers" ADD COLUMN "creditLimit" DECIMAL(14,2);
ALTER TABLE "suppliers" ADD COLUMN "requiresDetraccion" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "suppliers" ADD COLUMN "detraccionRate" DECIMAL(5,2);
