import { Module } from '@nestjs/common';
import { StoresModule } from '../stores/stores.module';
import { AttendanceClosingJob } from './application/attendance-closing.job';
import { AttendanceQueriesService } from './application/attendance-queries.service';
import { AttendanceReviewService } from './application/attendance-review.service';
import { ClockService } from './application/clock.service';
import { AttendanceRepository } from './domain/attendance.repository';
import { PrismaAttendanceRepository } from './infrastructure/prisma-attendance.repository';
import { AttendanceController } from './presentation/attendance.controller';
import { MyAttendanceController } from './presentation/my-attendance.controller';

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
  // Novedades lo usa para aplicar correcciones de marcación aprobadas
  exports: [AttendanceReviewService],
})
export class AttendanceModule {}
