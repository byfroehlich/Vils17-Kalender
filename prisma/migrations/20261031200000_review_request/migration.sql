-- Bewertungsanfrage durch die App statt Smoobu-Vorlage 6 (Entscheidung Mathias 31.10.2026)
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "reviewRequestSentAt" TIMESTAMP(3);
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "reviewRequestSkippedAt" TIMESTAMP(3);
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "reviewRequestSkipReason" TEXT;
