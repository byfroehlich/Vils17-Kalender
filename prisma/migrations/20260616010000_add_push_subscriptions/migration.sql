-- Add push reminder tracking to cleaning_assignments
ALTER TABLE "cleaning_assignments" ADD COLUMN "cleanerReminderSentAt" TIMESTAMP(3);
ALTER TABLE "cleaning_assignments" ADD COLUMN "adminReminderSentAt" TIMESTAMP(3);

-- Create push_subscriptions table
CREATE TABLE "push_subscriptions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");
CREATE INDEX "push_subscriptions_userId_idx" ON "push_subscriptions"("userId");
CREATE INDEX "push_subscriptions_organizationId_idx" ON "push_subscriptions"("organizationId");

ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
