-- Optional target dough weight per unit (grams) captured at recipe creation.
ALTER TABLE "recipes" ADD COLUMN IF NOT EXISTS "doughWeightPerUnitG" DECIMAL(10,2);
