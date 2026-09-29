import { Module } from '@nestjs/common';
import { RolesModule } from '../roles/roles.module';
import { UsersModule } from '../users/users.module';
import { EmployeesService } from './application/employees.service';
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
  controllers: [EmployeesController, PositionsController],
  providers: [
    EmployeesService,
    PositionsService,
    ChangeEmployeeStatusUseCase,
    GrantEmployeeAccessUseCase,
    { provide: EmployeeRepository, useClass: PrismaEmployeeRepository },
    { provide: PositionRepository, useClass: PrismaPositionRepository },
  ],
})
export class EmployeesModule {}
