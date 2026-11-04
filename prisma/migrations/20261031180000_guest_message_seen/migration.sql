CREATE TABLE "GuestMessageSeen" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "initial" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "GuestMessageSeen_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GuestMessageSeen_organizationId_bookingId_messageId_key" ON "GuestMessageSeen"("organizationId", "bookingId", "messageId");
CREATE INDEX "GuestMessageSeen_bookingId_idx" ON "GuestMessageSeen"("bookingId");
