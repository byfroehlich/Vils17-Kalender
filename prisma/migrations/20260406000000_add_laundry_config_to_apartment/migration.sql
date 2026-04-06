-- AddColumn laundryBedsDivisor to apartments
ALTER TABLE "apartments" ADD COLUMN IF NOT EXISTS "laundryBedsDivisor" INTEGER NOT NULL DEFAULT 2;

-- AddColumn laundryTowelsPerGuest to apartments
ALTER TABLE "apartments" ADD COLUMN IF NOT EXISTS "laundryTowelsPerGuest" INTEGER NOT NULL DEFAULT 1;

-- AddColumn laundryKitchenCount to apartments
ALTER TABLE "apartments" ADD COLUMN IF NOT EXISTS "laundryKitchenCount" INTEGER NOT NULL DEFAULT 1;
