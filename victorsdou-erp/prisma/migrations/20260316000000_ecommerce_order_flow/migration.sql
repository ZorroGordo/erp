-- Add ecommerce order status values
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'ACCEPTED';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'READY';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'IN_DELIVERY';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'RETURNED';

-- Add ecommerce fields to sales_orders
ALTER TABLE "sales_orders"
  ADD COLUMN IF NOT EXISTS "ecommerceOrderId"       TEXT,
  ADD COLUMN IF NOT EXISTS "ecommerceCustomerName"  TEXT,
  ADD COLUMN IF NOT EXISTS "ecommerceCustomerEmail" TEXT,
  ADD COLUMN IF NOT EXISTS "ecommerceCustomerPhone" TEXT,
  ADD COLUMN IF NOT EXISTS "addressSnap"            JSONB;
