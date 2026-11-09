-- Feriengast-Assistent (Theo per WhatsApp), Entscheidung Mathias 09.11.2026.
-- Token nur mit Scope gast:read (frei/belegt ohne Namen, eigene Buchung eines Gastes).
-- Hier liegt nur der SHA-256-Hash; der Klartext steht ausschließlich in der .env des Theo-Dienstes.
-- Widerrufen wie jedes Token unter Einstellungen → Schnittstelle.
INSERT INTO "mcp_tokens" ("id", "organizationId", "name", "hash", "prefix", "scopes", "createdAt")
SELECT 'theo_feriengast_2026', o."id", 'Theo Feriengast (WhatsApp)',
       '59787925c1441b0994cc08e86c72bbfb11fbd906c7b27814787071d2c9a0be1a', 'v17_QK2W',
       ARRAY['gast:read']::TEXT[], NOW()
FROM "organizations" o
ORDER BY o."createdAt" ASC
LIMIT 1
ON CONFLICT DO NOTHING;
