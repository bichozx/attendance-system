import { Module } from '@nestjs/common';
import { AttendanceModule } from '../attendance/attendance.module';
import { IncidentsService } from './application/incidents.service';
import { TimesheetService } from './application/timesheet.service';
import { IncidentRepository } from './domain/incident.repository';
import { PrismaIncidentRepository } from './infrastructure/prisma-incident.repository';
import {
  IncidentsController,
  MyIncidentsController,
  TimesheetsController,
} from './presentation/incidents.controller';

@Module({
  imports: [AttendanceModule],
  controllers: [
    IncidentsController,
    MyIncidentsController,
    TimesheetsController,
  ],
  providers: [
    IncidentsService,
    TimesheetService,
    { provide: IncidentRepository, useClass: PrismaIncidentRepository },
  ],
  // Reportes exporta el consolidado
  exports: [TimesheetService],
})
export class IncidentsModule {}
