-- Wäsche nach Bestand statt pro Buchung (Entscheidung Mathias 31.10.2026)
-- Lieferungen zählen erst nach Bestätigung „im Keller angekommen“ zum Bestand.
ALTER TABLE "laundry_deliveries" ADD COLUMN IF NOT EXISTS "arrivedAt" TIMESTAMP(3);
-- Bisher erfasste Lieferungen zählten ab dem Liefertag zum Bestand. Lieferungen, deren
-- Liefertag erreicht ist, gelten deshalb als angekommen (Bestand springt nicht); künftige
-- bleiben „unterwegs“ und werden bei Ankunft bestätigt — bis dahin zählen sie wie bisher
-- als schon bestellt.
UPDATE "laundry_deliveries" SET "arrivedAt" = "deliveryOn" WHERE "arrivedAt" IS NULL AND "deliveryOn" <= CURRENT_TIMESTAMP;

-- Höchstens eine Push-Meldung „Wäsche reicht nicht“ pro Tag
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "laundryAlertSentOn" TEXT;
