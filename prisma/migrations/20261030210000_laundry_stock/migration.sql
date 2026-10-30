-- Wäsche-Bestand im Keller, Lieferungen, Reserve je Teil
ALTER TABLE "organizations" ADD COLUMN "laundryReserve" JSONB;

CREATE TABLE "laundry_counts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "countedOn" TIMESTAMP(3) NOT NULL,
    "quantities" JSONB NOT NULL,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "laundry_counts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "laundry_counts_organizationId_countedOn_idx" ON "laundry_counts"("organizationId", "countedOn");
ALTER TABLE "laundry_counts" ADD CONSTRAINT "laundry_counts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "laundry_deliveries" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "deliveryOn" TIMESTAMP(3) NOT NULL,
    "quantities" JSONB NOT NULL,
    "reference" TEXT,
    "cancelled" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "laundry_deliveries_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "laundry_deliveries_organizationId_deliveryOn_idx" ON "laundry_deliveries"("organizationId", "deliveryOn");
ALTER TABLE "laundry_deliveries" ADD CONSTRAINT "laundry_deliveries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
