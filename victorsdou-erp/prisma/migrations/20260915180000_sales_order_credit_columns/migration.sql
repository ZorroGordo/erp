-- Deriva de un drift: SalesOrder.creditPaymentTermsDays y SalesOrder.paymentDueDate
-- existían en schema.prisma pero ninguna migración las creó nunca en la base. La
-- tabla estaba vacía en producción, así que el error salió recién cuando Luis
-- creó el primer pedido: "The column sales_orders.creditPaymentTermsDays does
-- not exist in the current database".
--
-- Las columnas ya se agregaron a mano en producción para desbloquear el módulo
-- de ventas; IF NOT EXISTS hace que esta migración sea idempotente y que aplique
-- igual en una base nueva o en local.

ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "creditPaymentTermsDays" INTEGER;
ALTER TABLE "sales_orders" ADD COLUMN IF NOT EXISTS "paymentDueDate" TIMESTAMP(3);
