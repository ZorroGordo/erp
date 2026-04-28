-- AlterEnum: add DRAFT to OrderStatus
ALTER TYPE "OrderStatus" ADD VALUE 'DRAFT' BEFORE 'CART';
