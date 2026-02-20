-- CreateEnum
CREATE TYPE "ComprobanteSource" AS ENUM ('MANUAL', 'EMAIL');

-- AlterTable
ALTER TABLE "comprobantes" ADD COLUMN     "emailSubject" TEXT,
ADD COLUMN     "senderEmail" TEXT,
ADD COLUMN     "source" "ComprobanteSource" NOT NULL DEFAULT 'MANUAL';

-- CreateIndex
CREATE INDEX "comprobantes_source_idx" ON "comprobantes"("source");
