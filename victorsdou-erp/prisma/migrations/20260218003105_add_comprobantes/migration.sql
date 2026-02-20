-- CreateEnum
CREATE TYPE "ComprobanteDocType" AS ENUM ('FACTURA', 'BOLETA', 'NOTA_CREDITO', 'NOTA_DEBITO', 'GUIA_REMISION', 'ORDEN_COMPRA', 'RECIBO_HONORARIOS', 'TICKET', 'LIQUIDACION_COMPRA', 'OTRO');

-- CreateEnum
CREATE TYPE "ComprobanteArchivoTipo" AS ENUM ('PDF', 'IMAGEN', 'XML');

-- CreateEnum
CREATE TYPE "ComprobanteEstado" AS ENUM ('PENDIENTE', 'VALIDADO', 'OBSERVADO', 'ANULADO');

-- CreateTable
CREATE TABLE "comprobantes" (
    "id" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'PEN',
    "montoTotal" DECIMAL(14,4),
    "purchaseOrderId" TEXT,
    "invoiceId" TEXT,
    "consolidacionRef" TEXT,
    "estado" "ComprobanteEstado" NOT NULL DEFAULT 'PENDIENTE',
    "notas" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comprobantes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comprobante_archivos" (
    "id" TEXT NOT NULL,
    "comprobanteId" TEXT NOT NULL,
    "docType" "ComprobanteDocType" NOT NULL,
    "archivoTipo" "ComprobanteArchivoTipo" NOT NULL,
    "nombreArchivo" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "tamanoBytes" INTEGER NOT NULL,
    "dataBase64" TEXT NOT NULL,
    "serie" TEXT,
    "correlativo" TEXT,
    "numero" TEXT,
    "fechaEmision" TIMESTAMP(3),
    "emisorRuc" TEXT,
    "emisorNombre" TEXT,
    "receptorRuc" TEXT,
    "receptorNombre" TEXT,
    "monedaDoc" TEXT,
    "subtotal" DECIMAL(14,4),
    "igv" DECIMAL(14,4),
    "total" DECIMAL(14,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comprobante_archivos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "comprobantes_fecha_idx" ON "comprobantes"("fecha");

-- CreateIndex
CREATE INDEX "comprobantes_estado_idx" ON "comprobantes"("estado");

-- CreateIndex
CREATE INDEX "comprobantes_purchaseOrderId_idx" ON "comprobantes"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "comprobante_archivos_comprobanteId_idx" ON "comprobante_archivos"("comprobanteId");

-- CreateIndex
CREATE INDEX "comprobante_archivos_emisorRuc_idx" ON "comprobante_archivos"("emisorRuc");

-- CreateIndex
CREATE INDEX "comprobante_archivos_numero_idx" ON "comprobante_archivos"("numero");

-- AddForeignKey
ALTER TABLE "comprobantes" ADD CONSTRAINT "comprobantes_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comprobantes" ADD CONSTRAINT "comprobantes_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comprobante_archivos" ADD CONSTRAINT "comprobante_archivos_comprobanteId_fkey" FOREIGN KEY ("comprobanteId") REFERENCES "comprobantes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
