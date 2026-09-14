-- Modificaciones ERP 08/09/26 — Cotizaciones de proveedor por correo.
-- Cotización recibida → extracción → link de aprobación → OC.

-- CreateEnum
CREATE TYPE "SupplierQuoteStatus" AS ENUM ('RECIBIDA', 'EN_APROBACION', 'APROBADA', 'RECHAZADA', 'ERROR');

-- CreateTable
CREATE TABLE "supplier_quotes" (
    "id" TEXT NOT NULL,
    "quoteNumber" TEXT NOT NULL,
    "supplierId" TEXT,
    "supplierNameRaw" TEXT,
    "supplierRuc" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'PEN',
    "exchangeRate" DECIMAL(8,4) NOT NULL DEFAULT 1,
    "subtotal" DECIMAL(14,4),
    "igv" DECIMAL(14,4),
    "total" DECIMAL(14,4),
    "validUntil" TIMESTAMP(3),
    "status" "SupplierQuoteStatus" NOT NULL DEFAULT 'RECIBIDA',
    "source" "ComprobanteSource" NOT NULL DEFAULT 'EMAIL',
    "senderEmail" TEXT,
    "emailSubject" TEXT,
    "messageId" TEXT,
    "extractedJson" JSONB,
    "extractionNotes" TEXT,
    "approvalToken" TEXT,
    "approvalTokenExpiresAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "approvedByEmail" TEXT,
    "rejectedReason" TEXT,
    "purchaseOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "supplier_quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_quote_lines" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "descripcionRaw" TEXT NOT NULL,
    "ingredientId" TEXT,
    "qty" DECIMAL(14,4) NOT NULL,
    "uom" TEXT NOT NULL,
    "unitPrice" DECIMAL(12,4) NOT NULL,
    "subtotal" DECIMAL(14,4),
    "igv" DECIMAL(14,4),
    "total" DECIMAL(14,4),
    "qtyBase" DECIMAL(14,4),
    "baseUom" TEXT,
    "conversionFactor" DECIMAL(14,8),
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "supplier_quote_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_quote_archivos" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "nombreArchivo" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "tamanoBytes" INTEGER NOT NULL,
    "dataBase64" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_quote_archivos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "supplier_quotes_quoteNumber_key" ON "supplier_quotes"("quoteNumber");
CREATE UNIQUE INDEX "supplier_quotes_messageId_key" ON "supplier_quotes"("messageId");
CREATE UNIQUE INDEX "supplier_quotes_approvalToken_key" ON "supplier_quotes"("approvalToken");
CREATE INDEX "supplier_quotes_status_idx" ON "supplier_quotes"("status");
CREATE INDEX "supplier_quotes_supplierId_idx" ON "supplier_quotes"("supplierId");
CREATE INDEX "supplier_quotes_createdAt_idx" ON "supplier_quotes"("createdAt");
CREATE INDEX "supplier_quote_lines_quoteId_idx" ON "supplier_quote_lines"("quoteId");
CREATE INDEX "supplier_quote_archivos_quoteId_idx" ON "supplier_quote_archivos"("quoteId");

-- AddForeignKey
ALTER TABLE "supplier_quotes" ADD CONSTRAINT "supplier_quotes_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "supplier_quote_lines" ADD CONSTRAINT "supplier_quote_lines_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "supplier_quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_quote_lines" ADD CONSTRAINT "supplier_quote_lines_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "supplier_quote_archivos" ADD CONSTRAINT "supplier_quote_archivos_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "supplier_quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
