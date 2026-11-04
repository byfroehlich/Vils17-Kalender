-- Gemeinsamer Stand der unbeantworteten Gästechats (Entscheidung Mathias 04.11.2026)
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "openChats" JSONB;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "openChatsAt" TIMESTAMP(3);
