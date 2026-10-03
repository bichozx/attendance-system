import { Module } from '@nestjs/common';
import { MaintenanceJob } from './application/maintenance.job';

@Module({ providers: [MaintenanceJob] })
export class MaintenanceModule {}
