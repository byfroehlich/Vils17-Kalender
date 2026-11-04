-- Mängel am Inventar und Verbrauchsmaterial (Meldung beim „Erledigt“ der Reinigung)
ALTER TABLE "cleaning_assignments" ADD COLUMN IF NOT EXISTS "checkedAt" TIMESTAMP(3);

CREATE TABLE "issues" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "apartmentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "assignmentId" TEXT,
    "previousBookingId" TEXT,
    "photo" BYTEA,
    "photoType" TEXT,
    "reportedById" TEXT,
    "reportedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "doneAt" TIMESTAMP(3),
    "doneNote" TEXT,
    CONSTRAINT "issues_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "issues_organizationId_doneAt_idx" ON "issues"("organizationId", "doneAt");
ALTER TABLE "issues" ADD CONSTRAINT "issues_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
