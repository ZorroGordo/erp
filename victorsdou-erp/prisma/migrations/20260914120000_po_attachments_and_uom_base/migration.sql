-- Modificaciones ERP 08/09/26 — módulo Orden de Compra.
-- Adjuntos de la OC (factura / certificado de calidad) y conversión de la
-- presentación de compra a la unidad de stock en las líneas de la OC.

-- CreateEnum
CREATE TYPE "POAttachmentKind" AS ENUM ('FACTURA', 'CERTIFICADO_CALIDAD', 'COTIZACION', 'GUIA_REMISION', 'OTRO');

-- AlterTable
ALTER TABLE "purchase_order_lines" ADD COLUMN     "qtyBase" DECIMAL(14,4),
ADD COLUMN     "baseUom" TEXT,
ADD COLUMN     "conversionFactor" DECIMAL(14,8);

-- CreateTable
CREATE TABLE "purchase_order_attachments" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "kind" "POAttachmentKind" NOT NULL DEFAULT 'OTRO',
    "nombreArchivo" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "tamanoBytes" INTEGER NOT NULL,
    "dataBase64" TEXT NOT NULL,
    "numero" TEXT,
    "fechaEmision" TIMESTAMP(3),
    "emisorRuc" TEXT,
    "total" DECIMAL(14,4),
    "lotesDetected" JSONB,
    "comprobanteId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "purchase_order_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "purchase_order_attachments_purchaseOrderId_idx" ON "purchase_order_attachments"("purchaseOrderId");

-- AddForeignKey
ALTER TABLE "purchase_order_attachments" ADD CONSTRAINT "purchase_order_attachments_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
