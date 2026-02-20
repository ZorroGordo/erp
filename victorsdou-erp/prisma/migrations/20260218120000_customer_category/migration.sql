-- Create CustomerCategory enum
CREATE TYPE "CustomerCategory" AS ENUM ('SUPERMERCADO', 'TIENDA_NATURISTA', 'CAFETERIA', 'RESTAURANTE', 'HOTEL');

-- Add category column (nullable — B2B requirement enforced at app level)
ALTER TABLE "customers" ADD COLUMN "category" "CustomerCategory";
