-- CreateEnum: QuotationStatus
CREATE TYPE "QuotationStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED');

-- CreateEnum: GuiaMovementType
CREATE TYPE "GuiaMovementType" AS ENUM ('VENTA', 'COMPRA', 'TRASLADO', 'DEVOLUCION', 'OTROS');

-- AlterTable: add postalCode to customer_addresses
ALTER TABLE "customer_addresses" ADD COLUMN "postalCode" TEXT;

-- AlterTable: add postalCode to sucursales
ALTER TABLE "sucursales" ADD COLUMN "postalCode" TEXT;

-- AlterTable: add Guía de Remisión fields to invoices
ALTER TABLE "invoices" ADD COLUMN "guiaMovementType" "GuiaMovementType";
ALTER TABLE "invoices" ADD COLUMN "guiaSenderName" TEXT;
ALTER TABLE "invoices" ADD COLUMN "guiaSenderAddress" TEXT;
ALTER TABLE "invoices" ADD COLUMN "guiaRecipientName" TEXT;
ALTER TABLE "invoices" ADD COLUMN "guiaRecipientAddress" TEXT;
ALTER TABLE "invoices" ADD COLUMN "guiaTransportistName" TEXT;
ALTER TABLE "invoices" ADD COLUMN "guiaTransportistRuc" TEXT;
ALTER TABLE "invoices" ADD COLUMN "guiaTransportistPlate" TEXT;
ALTER TABLE "invoices" ADD COLUMN "guiaTransportistLicense" TEXT;
ALTER TABLE "invoices" ADD COLUMN "guiaGoodsDescription" TEXT;

-- CreateTable: quotations
CREATE TABLE "quotations" (
    "id" TEXT NOT NULL,
    "quoteNumber" TEXT NOT NULL,
    "status" "QuotationStatus" NOT NULL DEFAULT 'DRAFT',
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT,
    "customerPhone" TEXT,
    "customerDocNo" TEXT,
    "customerDocType" TEXT,
    "customerId" TEXT,
    "subtotalPen" DECIMAL(14,4) NOT NULL,
    "igvPen" DECIMAL(14,4) NOT NULL,
    "totalPen" DECIMAL(14,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PEN',
    "validUntil" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "quotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable: quotation_lines
CREATE TABLE "quotation_lines" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "productId" TEXT,
    "productName" TEXT NOT NULL,
    "qty" DECIMAL(10,4) NOT NULL,
    "unitPrice" DECIMAL(12,4) NOT NULL,
    "lineTotalPen" DECIMAL(14,4) NOT NULL,
    "notes" TEXT,

    CONSTRAINT "quotation_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "quotations_quoteNumber_key" ON "quotations"("quoteNumber");
CREATE INDEX "quotations_status_createdAt_idx" ON "quotations"("status", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "quotation_lines" ADD CONSTRAINT "quotation_lines_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
