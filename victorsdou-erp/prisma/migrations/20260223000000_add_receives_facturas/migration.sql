-- AddColumn: receivesFacturas to customer_contacts
ALTER TABLE "customer_contacts" ADD COLUMN "receivesFacturas" BOOLEAN NOT NULL DEFAULT false;
