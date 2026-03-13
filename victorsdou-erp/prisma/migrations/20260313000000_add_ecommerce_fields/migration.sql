-- Add ecommerce fields to products table (safe: ADD COLUMN only, no data loss)
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "ecommerceEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "ecommercePrice" DECIMAL(12,4);
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "ecommerceImages" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "ecommerceMainImageIndex" INTEGER NOT NULL DEFAULT 0;
