-- Make entityId nullable on invoices table
ALTER TABLE "invoices" ALTER COLUMN "entityId" DROP NOT NULL;
