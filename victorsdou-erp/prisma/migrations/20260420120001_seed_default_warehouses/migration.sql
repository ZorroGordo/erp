-- Seed default warehouses (idempotent)
-- Runs in a separate migration so ALTER TYPE ADD VALUE from the previous
-- migration is already committed and the new enum values can be used.

INSERT INTO "warehouses" (id, name, type, "isActive", "createdAt")
SELECT gen_random_uuid(), 'Almacén Materias Primas', 'RAW_MATERIAL', true, now()
WHERE NOT EXISTS (SELECT 1 FROM "warehouses" WHERE type = 'RAW_MATERIAL');

INSERT INTO "warehouses" (id, name, type, "isActive", "createdAt")
SELECT gen_random_uuid(), 'Almacén Productos Intermedios', 'INTERMEDIATE', true, now()
WHERE NOT EXISTS (SELECT 1 FROM "warehouses" WHERE type = 'INTERMEDIATE');

INSERT INTO "warehouses" (id, name, type, "isActive", "createdAt")
SELECT gen_random_uuid(), 'Almacén Productos Terminados', 'FINISHED_GOODS', true, now()
WHERE NOT EXISTS (SELECT 1 FROM "warehouses" WHERE type = 'FINISHED_GOODS');
