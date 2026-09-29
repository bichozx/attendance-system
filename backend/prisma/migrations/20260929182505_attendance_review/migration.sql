-- AlterTable
ALTER TABLE "attendance_events" ADD COLUMN     "clockDriftSeconds" INTEGER,
ADD COLUMN     "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "attendances" ADD COLUMN     "needsReview" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reviewReasons" TEXT[],
ADD COLUMN     "reviewedAt" TIMESTAMPTZ(3),
ADD COLUMN     "reviewedById" UUID;

-- CreateIndex
CREATE INDEX "attendances_companyId_needsReview_idx" ON "attendances"("companyId", "needsReview");

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
