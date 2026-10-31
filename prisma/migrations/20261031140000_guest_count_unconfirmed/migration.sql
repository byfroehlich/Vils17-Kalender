-- Gästezahl unbestätigt: einmalige Push-Warnung je Buchung (Entscheidung Mathias 31.10.2026)
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "guestCountReminderSentAt" TIMESTAMP(3);
