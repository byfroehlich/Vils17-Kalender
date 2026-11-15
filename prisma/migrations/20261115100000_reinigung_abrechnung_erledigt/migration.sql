-- Abrechnung nach Erledigt-Zeitpunkt statt Abreisemonat (Entscheidung Mathias 15.11.2026)
ALTER TABLE "cleaning_assignments" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3);

-- Altbestand: Zeitpunkt aus dem Protokoll, sonst Reinigungstag (Anreise der nächsten Gäste)
UPDATE "cleaning_assignments" ca
SET "completedAt" = COALESCE(
  (SELECT MAX(al."createdAt") FROM "audit_logs" al
    WHERE al."entityId" = ca."id"
      AND al."action" = 'assignment.status.updated'
      AND al."details"->>'nachher' = 'COMPLETED'),
  b."checkIn"
)
FROM "bookings" b
WHERE b."id" = ca."bookingId" AND ca."status" = 'COMPLETED' AND ca."completedAt" IS NULL;
