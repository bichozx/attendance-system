-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "defaultBreakMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "defaultEarlyClockInMinutes" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "defaultLateToleranceMinutes" INTEGER NOT NULL DEFAULT 0;
