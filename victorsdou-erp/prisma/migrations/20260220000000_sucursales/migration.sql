-- CreateTable
CREATE TABLE "sucursales" (
    "id"                TEXT NOT NULL,
    "customerId"        TEXT NOT NULL,
    "name"              TEXT NOT NULL,
    "contactName"       TEXT,
    "contactPhone"      TEXT,
    "contactEmail"      TEXT,
    "addressLine1"      TEXT NOT NULL,
    "addressLine2"      TEXT,
    "district"          TEXT NOT NULL,
    "province"          TEXT NOT NULL DEFAULT 'Lima',
    "department"        TEXT NOT NULL DEFAULT 'Lima',
    "deliveryFrequency" TEXT,
    "deliveryDays"      TEXT[] NOT NULL DEFAULT '{}',
    "deliveryUnitsQty"  DECIMAL(10,2),
    "deliveryHour"      TEXT,
    "deliveryNotes"     TEXT,
    "isActive"          BOOLEAN NOT NULL DEFAULT true,
    "notes"             TEXT,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sucursales_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sucursales_customerId_idx" ON "sucursales"("customerId");

-- AddForeignKey
ALTER TABLE "sucursales" ADD CONSTRAINT "sucursales_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
