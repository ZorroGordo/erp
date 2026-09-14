-- Modificaciones ERP 08/09/26 — Control de pagos.
-- Glosa (tipo de gasto), fecha de vencimiento separada de la fecha de pago, y
-- pagos con voucher.

-- AlterTable
ALTER TABLE "comprobantes" ADD COLUMN     "glosa" TEXT,
ADD COLUMN     "fechaVencimiento" TIMESTAMP(3);

-- La UI usaba "F. Pago" como fecha de vencimiento (se pintaba en rojo al
-- pasarse). Se mueve ese dato a la columna correcta y se libera fechaPago, que
-- a partir de ahora sólo se llena cuando el comprobante queda cancelado.
UPDATE "comprobantes" SET "fechaVencimiento" = "fechaPago" WHERE "fechaPago" IS NOT NULL;
UPDATE "comprobantes" SET "fechaPago" = NULL;

-- CreateTable
CREATE TABLE "comprobante_pagos" (
    "id" TEXT NOT NULL,
    "comprobanteId" TEXT NOT NULL,
    "fechaPago" TIMESTAMP(3) NOT NULL,
    "monto" DECIMAL(14,4) NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'PEN',
    "medio" TEXT,
    "referencia" TEXT,
    "notas" TEXT,
    "nombreArchivo" TEXT,
    "mimeType" TEXT,
    "tamanoBytes" INTEGER,
    "dataBase64" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "comprobante_pagos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "comprobante_pagos_comprobanteId_idx" ON "comprobante_pagos"("comprobanteId");
CREATE INDEX "comprobante_pagos_fechaPago_idx" ON "comprobante_pagos"("fechaPago");
CREATE INDEX "comprobantes_fechaVencimiento_idx" ON "comprobantes"("fechaVencimiento");
CREATE INDEX "comprobantes_glosa_idx" ON "comprobantes"("glosa");

-- AddForeignKey
ALTER TABLE "comprobante_pagos" ADD CONSTRAINT "comprobante_pagos_comprobanteId_fkey" FOREIGN KEY ("comprobanteId") REFERENCES "comprobantes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
