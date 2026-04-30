-- AlterTable: add credit payment terms fields to sales_orders
ALTER TABLE "sales_orders" ADD COLUMN "creditPaymentTermsDays" INTEGER;
ALTER TABLE "sales_orders" ADD COLUMN "paymentDueDate" TIMESTAMP(3);
