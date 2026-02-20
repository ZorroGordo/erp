-- CreateTable: ingredient_alerts
-- Per-ingredient dashboard threshold & email alert settings

CREATE TABLE "ingredient_alerts" (
    "id"             TEXT NOT NULL,
    "ingredientId"   TEXT NOT NULL,
    "alertThreshold" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "minThreshold"   DECIMAL(14,4) NOT NULL DEFAULT 0,
    "alertEmails"    TEXT[]        NOT NULL DEFAULT '{}',
    "dashboardUnit"  TEXT          NOT NULL DEFAULT 'qty',
    "lastAlertAt"    TIMESTAMP(3),
    "lastMinAlertAt" TIMESTAMP(3),

    CONSTRAINT "ingredient_alerts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ingredient_alerts_ingredientId_key"
    ON "ingredient_alerts"("ingredientId");

ALTER TABLE "ingredient_alerts"
    ADD CONSTRAINT "ingredient_alerts_ingredientId_fkey"
    FOREIGN KEY ("ingredientId")
    REFERENCES "ingredients"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
