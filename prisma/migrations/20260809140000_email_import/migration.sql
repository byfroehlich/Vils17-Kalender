-- Herkunft einer abweichenden Gästezahl ("manual" | "email")
ALTER TABLE "bookings" ADD COLUMN "guestCountSource" TEXT;

-- Protokoll der ausgewerteten Portal-Mails
CREATE TABLE "email_imports" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "portal" TEXT,
    "subject" TEXT,
    "receivedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "detail" TEXT,
    "bookingId" TEXT,
    "parsedGuestCount" INTEGER,
    "parsedAdults" INTEGER,
    "parsedChildren" INTEGER,
    "parsedPets" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_imports_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "email_imports_messageId_key" ON "email_imports"("messageId");
CREATE INDEX "email_imports_organizationId_createdAt_idx" ON "email_imports"("organizationId", "createdAt");

ALTER TABLE "email_imports" ADD CONSTRAINT "email_imports_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "email_imports" ADD CONSTRAINT "email_imports_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
