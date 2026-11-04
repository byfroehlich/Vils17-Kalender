-- Schlafzimmer-Frage bei 2 Gästen (Entscheidung Mathias 31.10.2026)
ALTER TABLE "apartments" ADD COLUMN IF NOT EXISTS "askSeparateBedrooms" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "bedroomQuestionSentAt" TIMESTAMP(3);

-- Penthouse No. 17
UPDATE "apartments" SET "askSeparateBedrooms" = true WHERE "id" = 'cmnmbwytk0001xlnj85sivr5a';

-- Michèle Podkowa wurde am 31.10.2026 schon von Hand gefragt
UPDATE "bookings" SET "bedroomQuestionSentAt" = '2026-10-31 12:00:00' WHERE "id" = 'cmsws2o2u001j2e0f89k4fwaa' AND "bedroomQuestionSentAt" IS NULL;
