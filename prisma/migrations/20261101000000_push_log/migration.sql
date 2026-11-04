-- Versandprotokoll Push (Entscheidung Mathias 01.11.2026)
CREATE TABLE IF NOT EXISTS "push_logs" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "userName" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "devices" INTEGER NOT NULL,
  "sent" INTEGER NOT NULL,
  "failed" INTEGER NOT NULL,
  "removed" INTEGER NOT NULL,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "push_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "push_logs_organizationId_createdAt_idx" ON "push_logs"("organizationId", "createdAt");
CREATE INDEX IF NOT EXISTS "push_logs_userId_createdAt_idx" ON "push_logs"("userId", "createdAt");
