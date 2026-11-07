-- Bewertungsanfrage auch an Booking.com-Gäste der Lodge (Entscheidung Mathias 07.11.2026):
-- die Lodge hat bei Booking.com erst drei Bewertungen (Note 6,0), jede neue zählt stark.
ALTER TABLE "apartments" ADD COLUMN IF NOT EXISTS "reviewRequestBooking" BOOLEAN NOT NULL DEFAULT false;

-- Lodge No. 17
UPDATE "apartments" SET "reviewRequestBooking" = true WHERE "name" ILIKE '%lodge%';
