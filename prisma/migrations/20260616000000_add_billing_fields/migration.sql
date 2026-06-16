-- Add cleanerRate to users (default 50€ per job)
ALTER TABLE "users" ADD COLUMN "cleanerRate" DOUBLE PRECISION NOT NULL DEFAULT 50;

-- Add payout tracking to cleaning_assignments
ALTER TABLE "cleaning_assignments" ADD COLUMN "paidOut" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "cleaning_assignments" ADD COLUMN "paidOutAt" TIMESTAMP(3);
