-- Betten der beiden Vils17-Wohnungen (Mathias 30.10.2026), nur wenn noch nichts eingetragen ist:
-- Penthouse (Smoobu 2943886): Kingsize 200×200 (2 P.), Kingsize 180×200 (2 P.), Büro-Schlafcouch 100×200 (1 P., 90er Laken)
-- Lodge (Smoobu 3443356): Kingsize 180×200 (2 P.), Ecksofa ausziehbar 180 (2 P.)
UPDATE "apartments" SET "laundryBeds" = '[{"width":200,"persons":2},{"width":180,"persons":2},{"width":90,"persons":1}]'::jsonb
WHERE "smoobuId" = 2943886 AND "laundryBeds" IS NULL;
UPDATE "apartments" SET "laundryBeds" = '[{"width":180,"persons":2},{"width":180,"persons":2}]'::jsonb
WHERE "smoobuId" = 3443356 AND "laundryBeds" IS NULL;
