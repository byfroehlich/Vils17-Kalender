-- Betten je Wohnung für Spannbettlaken-Größen (90/180/200)
ALTER TABLE "apartments" ADD COLUMN IF NOT EXISTS "laundryBeds" JSONB;
