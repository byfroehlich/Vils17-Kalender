-- Zeitpunkt des letzten erfolgreichen Smoobu-Syncs
ALTER TABLE "organizations" ADD COLUMN "lastSyncAt" TIMESTAMP(3);
