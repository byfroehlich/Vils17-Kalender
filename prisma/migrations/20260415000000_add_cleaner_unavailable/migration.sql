-- AlterTable
ALTER TABLE "cleaning_assignments"
  ADD COLUMN "cleanerUnavailable"     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "cleanerUnavailableNote" TEXT,
  ADD COLUMN "cleanerUnavailableAt"   TIMESTAMP(3);
