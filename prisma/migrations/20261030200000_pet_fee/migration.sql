-- Hunde-Erkennung und Hundegebühr
ALTER TABLE "bookings" ADD COLUMN "petSource" TEXT;
ALTER TABLE "bookings" ADD COLUMN "petHint" TEXT;
ALTER TABLE "bookings" ADD COLUMN "petFeeStatus" TEXT;
ALTER TABLE "bookings" ADD COLUMN "petFeeAmount" DOUBLE PRECISION;
ALTER TABLE "bookings" ADD COLUMN "petFeeRequestedAt" TIMESTAMP(3);
ALTER TABLE "bookings" ADD COLUMN "petFeePaidAt" TIMESTAMP(3);
-- Bisher von Hand gepflegte Hundezahlen als manuell markieren
UPDATE "bookings" SET "petSource" = 'manual' WHERE "petCount" IS NOT NULL;
