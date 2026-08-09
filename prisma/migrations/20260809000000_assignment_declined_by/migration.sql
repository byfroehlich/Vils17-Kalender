-- Absage-Historie: wer hat abgesagt (bleibt nach Übernahme durch andere erhalten)
ALTER TABLE "cleaning_assignments" ADD COLUMN "declinedById" TEXT;
ALTER TABLE "cleaning_assignments" ADD CONSTRAINT "cleaning_assignments_declinedById_fkey" FOREIGN KEY ("declinedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Bestehende aktive Absagen: declinedById aus cleanerId übernehmen
UPDATE "cleaning_assignments" SET "declinedById" = "cleanerId" WHERE "cleanerUnavailable" = true AND "cleanerId" IS NOT NULL;
