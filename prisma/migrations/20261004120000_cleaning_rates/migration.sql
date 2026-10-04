-- ─── Felder ───────────────────────────────────────────────────────────────────
ALTER TABLE "apartments" ADD COLUMN "cleaningRate" DOUBLE PRECISION;
ALTER TABLE "apartments" ADD COLUMN "cleaningRateFrom" TIMESTAMP(3);
ALTER TABLE "apartments" ADD COLUMN "cleaningRateCleanerId" TEXT;
ALTER TABLE "apartments" ADD CONSTRAINT "apartments_cleaningRateCleanerId_fkey"
  FOREIGN KEY ("cleaningRateCleanerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "bookings" ADD COLUMN "premiumRate" DOUBLE PRECISION;
ALTER TABLE "bookings" ADD COLUMN "premiumRateCleanerId" TEXT;

ALTER TABLE "cleaning_assignments" ADD COLUMN "rate" DOUBLE PRECISION;

-- ─── Bestand festschreiben ────────────────────────────────────────────────────
-- Alle bereits erledigten Reinigungen behalten den Satz, der bisher galt.
-- Ohne diesen Schritt würde eine spätere Satzänderung sie rückwirkend verändern.
UPDATE "cleaning_assignments" ca
SET "rate" = u."cleanerRate"
FROM "users" u
WHERE ca."cleanerId" = u."id" AND ca."status" = 'COMPLETED';

-- ─── Penthouse: 70 € für Vanessa ──────────────────────────────────────────────
-- Gilt für Buchungen, die ab 04.10.2026 00:00 Uhr (Wien) ins System kommen.
-- Alles davor bleibt beim normalen Satz. Prüf- und änderbar in den Einstellungen.
UPDATE "apartments" a
SET "cleaningRate" = 70,
    "cleaningRateFrom" = TIMESTAMP '2026-10-03 22:00:00',
    "cleaningRateCleanerId" = (
      SELECT u."id" FROM "users" u
      WHERE u."organizationId" = a."organizationId"
        AND u."role" = 'CLEANER'
        AND u."name" ILIKE 'Vanessa%'
      ORDER BY u."createdAt"
      LIMIT 1
    )
WHERE a."name" ILIKE 'Penthouse%';

-- Penthouse-Buchungen, die seit dem Stichtag schon eingegangen sind, nachträglich markieren
UPDATE "bookings" b
SET "premiumRate" = a."cleaningRate",
    "premiumRateCleanerId" = a."cleaningRateCleanerId"
FROM "apartments" a
WHERE b."apartmentId" = a."id"
  AND a."cleaningRate" IS NOT NULL
  AND a."cleaningRateCleanerId" IS NOT NULL
  AND b."createdAt" >= a."cleaningRateFrom";
