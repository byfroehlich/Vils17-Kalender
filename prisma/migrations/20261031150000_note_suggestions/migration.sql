-- Hinweise für die Reinigung aus dem Gästechat (Entscheidung Mathias 31.10.2026)
ALTER TABLE "cleaning_assignments" ADD COLUMN IF NOT EXISTS "extraBeds" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "noteScanAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "note_suggestions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "proposedText" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,
    "extraBeds" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    CONSTRAINT "note_suggestions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "note_suggestions_organizationId_messageId_key" ON "note_suggestions"("organizationId", "messageId");
CREATE INDEX IF NOT EXISTS "note_suggestions_organizationId_status_idx" ON "note_suggestions"("organizationId", "status");

ALTER TABLE "note_suggestions" ADD CONSTRAINT "note_suggestions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "note_suggestions" ADD CONSTRAINT "note_suggestions_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
