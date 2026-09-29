import { AttendanceClosingJob } from './application/attendance-closing.job';
import { AttendanceController } from './presentation/attendance.controller';
import { AttendanceQueriesService } from './application/attendance-queries.service';
import { AttendanceRepository } from './domain/attendance.repository';
import { AttendanceReviewService } from './application/attendance-review.service';
import { ClockService } from './application/clock.service';
import { Module } from '@nestjs/common';
import { MyAttendanceController } from './presentation/my-attendance.controller';
import { PrismaAttendanceRepository } from './infrastructure/prisma-attendance.repository';
import { StoresModule } from '../stores/stores.module';

@Module({
  imports: [StoresModule],
  controllers: [MyAttendanceController, AttendanceController],
  providers: [
    ClockService,
    AttendanceQueriesService,
    AttendanceReviewService,
    AttendanceClosingJob,
    { provide: AttendanceRepository, useClass: PrismaAttendanceRepository },
  ],
  exports: [AttendanceReviewService],
})
export class AttendanceModule {}
