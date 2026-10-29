-- CreateTable
CREATE TABLE "mcp_tokens" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "scopes" TEXT[],
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "mcp_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mcp_tokens_hash_key" ON "mcp_tokens"("hash");

-- CreateIndex
CREATE INDEX "mcp_tokens_organizationId_idx" ON "mcp_tokens"("organizationId");

-- AddForeignKey
ALTER TABLE "mcp_tokens" ADD CONSTRAINT "mcp_tokens_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

