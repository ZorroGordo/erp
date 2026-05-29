-- Rename the mis-spelled finished-goods category "Boyería" -> "Bollería".
-- Existing products keep their link because it is the same row.
UPDATE "product_categories" SET name = 'Bollería' WHERE name = 'Boyería';

-- Ensure the corrected category exists even on a fresh database.
INSERT INTO "product_categories" (id, name, "isActive")
SELECT gen_random_uuid(), 'Bollería', true
WHERE NOT EXISTS (SELECT 1 FROM "product_categories" WHERE name = 'Bollería');

-- Default category used for intermediates / raw materials created without one.
INSERT INTO "product_categories" (id, name, "isActive")
SELECT gen_random_uuid(), 'Sin categoría', true
WHERE NOT EXISTS (SELECT 1 FROM "product_categories" WHERE name = 'Sin categoría');
