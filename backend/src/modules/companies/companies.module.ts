import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CompanySettingsService } from './application/company-settings.service';
import { PlatformCompaniesService } from './application/platform-companies.service';
import { CompanyRepository } from './domain/company.repository';
import { PrismaCompanyRepository } from './infrastructure/prisma-company.repository';
import { CompanyController } from './presentation/company.controller';
import { PlatformCompaniesController } from './presentation/platform-companies.controller';

@Module({
  imports: [AuthModule],
  controllers: [CompanyController, PlatformCompaniesController],
  providers: [
    CompanySettingsService,
    PlatformCompaniesService,
    { provide: CompanyRepository, useClass: PrismaCompanyRepository },
  ],
})
export class CompaniesModule {}
