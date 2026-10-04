-- Tagesstatus höchstens einmal pro Tag
ALTER TABLE "organizations" ADD COLUMN "dailyStatusSentOn" TEXT;
-- Wäsche-Warnung höchstens einmal pro Auftrag
ALTER TABLE "cleaning_assignments" ADD COLUMN "laundryReminderSentAt" TIMESTAMP(3);
