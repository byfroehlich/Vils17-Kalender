-- Korrigiert 01.11.2026: Tabelle heißt "bookings" (@@map), nicht "Booking" — der erste Lauf scheiterte daran.
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "chatDoneMessageId" TEXT;
