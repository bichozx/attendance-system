-- Cargos predeterminados para las empresas que ya existen (las nuevas los reciben al crearse).
-- No toca los cargos que cada empresa ya tenga: si el nombre existe (sin importar mayúsculas), se omite.
INSERT INTO "positions" ("id", "companyId", "name", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid(), c."id", d."name", true, now(), now()
FROM "companies" c
CROSS JOIN (VALUES
  ('Cocina'),
  ('Caja'),
  ('Bar'),
  ('Host'),
  ('Servicio'),
  ('Líder'),
  ('Supernumeraria de servicio')
) AS d("name")
WHERE c."deletedAt" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "positions" p
    WHERE p."companyId" = c."id" AND lower(p."name") = lower(d."name")
  );
