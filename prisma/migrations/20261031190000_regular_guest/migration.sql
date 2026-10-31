-- Stammgast-Liste mit Einwilligung je Kanal (Entscheidung Mathias 31.10.2026)
CREATE TABLE IF NOT EXISTS "regular_guests" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "apartment" TEXT,
    "consentEmail" BOOLEAN NOT NULL DEFAULT false,
    "consentWhatsapp" BOOLEAN NOT NULL DEFAULT false,
    "consentText" TEXT NOT NULL,
    "consentAt" TIMESTAMP(3) NOT NULL,
    "unsubscribeToken" TEXT NOT NULL,
    "unsubscribedAt" TIMESTAMP(3),
    "source" TEXT NOT NULL DEFAULT 'gaestemappe',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "regular_guests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "regular_guests_unsubscribeToken_key" ON "regular_guests"("unsubscribeToken");
CREATE UNIQUE INDEX IF NOT EXISTS "regular_guests_organizationId_email_key" ON "regular_guests"("organizationId", "email");
CREATE INDEX IF NOT EXISTS "regular_guests_organizationId_unsubscribedAt_idx" ON "regular_guests"("organizationId", "unsubscribedAt");

ALTER TABLE "regular_guests" ADD CONSTRAINT "regular_guests_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
