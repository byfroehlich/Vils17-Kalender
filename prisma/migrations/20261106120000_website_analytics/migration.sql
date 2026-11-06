-- Website-Besuchermessung vils17.at (Entscheidung Mathias 06.11.2026): ohne Cookies, Tages-Hash statt IP,
-- Rohdaten 13 Monate. IP und vollständiger User-Agent werden nie gespeichert.
-- CreateTable
CREATE TABLE "website_visits" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "visitorHash" TEXT NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "path" TEXT NOT NULL,
    "referrer" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "language" TEXT,
    "device" TEXT NOT NULL,
    "country" TEXT,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "scrollDepth" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "website_visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "website_events" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "visitorHash" TEXT NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "type" TEXT NOT NULL,
    "target" TEXT,
    "dedupeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "website_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "website_salts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "salt" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "website_salts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "website_visits_organizationId_day_idx" ON "website_visits"("organizationId", "day");

-- CreateIndex
CREATE INDEX "website_visits_createdAt_idx" ON "website_visits"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "website_visits_organizationId_pageId_key" ON "website_visits"("organizationId", "pageId");

-- CreateIndex
CREATE INDEX "website_events_organizationId_day_idx" ON "website_events"("organizationId", "day");

-- CreateIndex
CREATE INDEX "website_events_visitId_idx" ON "website_events"("visitId");

-- CreateIndex
CREATE INDEX "website_events_createdAt_idx" ON "website_events"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "website_events_organizationId_dedupeKey_key" ON "website_events"("organizationId", "dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "website_salts_organizationId_day_key" ON "website_salts"("organizationId", "day");

-- AddForeignKey
ALTER TABLE "website_visits" ADD CONSTRAINT "website_visits_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "website_events" ADD CONSTRAINT "website_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "website_events" ADD CONSTRAINT "website_events_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "website_visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "website_salts" ADD CONSTRAINT "website_salts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

