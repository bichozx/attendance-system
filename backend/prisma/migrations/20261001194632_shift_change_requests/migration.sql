-- AlterTable
ALTER TABLE "shift_changes" ADD COLUMN     "counterpartAssignmentId" UUID,
ADD COLUMN     "isRequest" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "peerAccepted" BOOLEAN,
ADD COLUMN     "peerRespondedAt" TIMESTAMPTZ(3),
ADD COLUMN     "reviewNotes" TEXT;

-- CreateIndex
CREATE INDEX "shift_changes_companyId_isRequest_status_idx" ON "shift_changes"("companyId", "isRequest", "status");

-- AddForeignKey
ALTER TABLE "shift_changes" ADD CONSTRAINT "shift_changes_counterpartAssignmentId_fkey" FOREIGN KEY ("counterpartAssignmentId") REFERENCES "shift_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
