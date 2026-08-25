-- Von Hand korrigierte Gästezahl gegen Überschreiben durch den Sync schützen
ALTER TABLE "bookings" ADD COLUMN "guestCountManual" BOOLEAN NOT NULL DEFAULT false;
