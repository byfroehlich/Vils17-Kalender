-- Hundebetreuung: Hinweis Fröhliche Pfoten an Gäste mit Hund + automatische Hundeprüfung (Mathias 11.11.2026)
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "dogCareMessageSentAt" TIMESTAMP(3);
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "petScanAt" TIMESTAMP(3);
