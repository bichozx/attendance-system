import { Module } from '@nestjs/common';
import { IncidentsModule } from '../incidents/incidents.module';
import { AuditQueryService } from './application/audit-query.service';
import { DashboardService } from './application/dashboard.service';
import { ReportsService } from './application/reports.service';
import { ReportsRepository } from './domain/reports.repository';
import { ExcelReportWriter } from './infrastructure/excel-report.writer';
import { PdfReportWriter } from './infrastructure/pdf-report.writer';
import { PrismaReportsRepository } from './infrastructure/prisma-reports.repository';
import {
  AuditLogsController,
  ReportsController,
} from './presentation/reports.controller';

@Module({
  imports: [IncidentsModule],
  controllers: [ReportsController, AuditLogsController],
  providers: [
    DashboardService,
    ReportsService,
    AuditQueryService,
    ExcelReportWriter,
    PdfReportWriter,
    { provide: ReportsRepository, useClass: PrismaReportsRepository },
  ],
})
export class ReportsModule {}
