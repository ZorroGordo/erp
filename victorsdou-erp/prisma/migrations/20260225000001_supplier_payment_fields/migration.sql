-- AlterTable: add payment detail fields to suppliers
ALTER TABLE "suppliers" ADD COLUMN "paymentMethod" TEXT;
ALTER TABLE "suppliers" ADD COLUMN "bankName" TEXT;
ALTER TABLE "suppliers" ADD COLUMN "bankAccount" TEXT;
