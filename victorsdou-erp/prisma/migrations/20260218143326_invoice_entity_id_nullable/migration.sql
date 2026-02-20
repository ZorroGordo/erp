-- DropForeignKey
ALTER TABLE "invoices" DROP CONSTRAINT "invoice_customer_fk";

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoice_customer_fk" FOREIGN KEY ("entityId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
