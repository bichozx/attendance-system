import { Module } from '@nestjs/common';
import { SchedulePeriodsService } from './application/schedule-periods.service';
import { ShiftChangeRequestsService } from './application/shift-change-requests.service';
import { ShiftChangeRepository } from './domain/shift-change.repository';
import { PrismaShiftChangeRepository } from './infrastructure/prisma-shift-change.repository';
import {
  MyShiftChangesController,
  ShiftChangesController,
} from './presentation/shift-changes.controller';
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
    MyShiftChangesController,
    ShiftChangesController,
  ],
  providers: [
    SchedulePeriodsService,
    ShiftsService,
    ShiftChangeRequestsService,
    { provide: ShiftChangeRepository, useClass: PrismaShiftChangeRepository },
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
