-- AlterTable
ALTER TABLE "apartments" ADD COLUMN "preferredCleanerId" TEXT;

-- AddForeignKey
ALTER TABLE "apartments" ADD CONSTRAINT "apartments_preferredCleanerId_fkey" FOREIGN KEY ("preferredCleanerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
