import { Module } from '@nestjs/common';
import { RolesModule } from '../roles/roles.module';
import { UsersModule } from '../users/users.module';
import { ContractsService } from './application/contracts.service';
import { EmployeeImportService } from './application/employee-import.service';
import { EmployeesService } from './application/employees.service';
import { ContractRepository } from './domain/contract.repository';
import { EmployeeImportRepository } from './domain/import/employee-import.repository';
import { PrismaEmployeeImportRepository } from './infrastructure/import/prisma-employee-import.repository';
import { SpreadsheetIO } from './infrastructure/import/spreadsheet.io';
import { PrismaContractRepository } from './infrastructure/prisma-contract.repository';
import { ContractsController } from './presentation/contracts.controller';
import { EmployeeImportController } from './presentation/employee-import.controller';
import { PositionsService } from './application/positions.service';
import { ChangeEmployeeStatusUseCase } from './application/use-cases/change-employee-status.use-case';
import { GrantEmployeeAccessUseCase } from './application/use-cases/grant-employee-access.use-case';
import { EmployeeRepository } from './domain/employee.repository';
import { PositionRepository } from './domain/position.repository';
import { PrismaEmployeeRepository } from './infrastructure/prisma-employee.repository';
import { PrismaPositionRepository } from './infrastructure/prisma-position.repository';
import { EmployeesController } from './presentation/employees.controller';
import { PositionsController } from './presentation/positions.controller';

@Module({
  imports: [UsersModule, RolesModule],
  // La importación va primero: si no, GET /employees/:id capturaría /employees/import/...
  controllers: [
    EmployeeImportController,
    ContractsController,
    EmployeesController,
    PositionsController,
  ],
  providers: [
    EmployeesService,
    ContractsService,
    EmployeeImportService,
    SpreadsheetIO,
    { provide: ContractRepository, useClass: PrismaContractRepository },
    {
      provide: EmployeeImportRepository,
      useClass: PrismaEmployeeImportRepository,
    },
    PositionsService,
    ChangeEmployeeStatusUseCase,
    GrantEmployeeAccessUseCase,
    { provide: EmployeeRepository, useClass: PrismaEmployeeRepository },
    { provide: PositionRepository, useClass: PrismaPositionRepository },
  ],
})
export class EmployeesModule {}
