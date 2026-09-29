import { Module } from '@nestjs/common';
import { SchedulePeriodsService } from './application/schedule-periods.service';
import { ShiftsService } from './application/shifts.service';
import {
  SchedulePeriodRepository,
  ShiftRepository,
} from './domain/shift.repository';
import { PrismaSchedulePeriodRepository } from './infrastructure/prisma-schedule-period.repository';
import { PrismaShiftRepository } from './infrastructure/prisma-shift.repository';
import { MyShiftsController } from './presentation/my-shifts.controller';
import { SchedulePeriodsController } from './presentation/schedule-periods.controller';
import { ShiftsController } from './presentation/shifts.controller';

@Module({
  controllers: [
    SchedulePeriodsController,
    ShiftsController,
    MyShiftsController,
  ],
  providers: [
    SchedulePeriodsService,
    ShiftsService,
    {
      provide: SchedulePeriodRepository,
      useClass: PrismaSchedulePeriodRepository,
    },
    { provide: ShiftRepository, useClass: PrismaShiftRepository },
  ],
  // El módulo de asistencia lo usará para encontrar el turno al marcar
  exports: [ShiftsService],
})
export class ShiftsModule {}
