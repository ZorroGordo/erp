-- Comentarios ERP 09/11/26: los lotes de producto terminado quedaban "sin lote"
-- cuando el campo se dejaba vacío al cerrar la OP. Desde ahora el lote por
-- defecto es el número de la OP; se rellenan los lotes históricos igual.
UPDATE "product_stock_movements"
SET    "lotNumber" = "productionOrderRef"
WHERE  "type" = 'PRODUCTION_OUTPUT'
  AND  ("lotNumber" IS NULL OR btrim("lotNumber") = '')
  AND  "productionOrderRef" IS NOT NULL;
