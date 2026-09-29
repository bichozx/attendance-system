import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RolesModule } from '../roles/roles.module';
import { CompanyUsersService } from './application/company-users.service';
import { UserAccountsService } from './application/user-accounts.service';
import { CompanyUserRepository } from './domain/company-user.repository';
import { PrismaCompanyUserRepository } from './infrastructure/prisma-company-user.repository';
import { UsersController } from './presentation/users.controller';

@Module({
  imports: [AuthModule, RolesModule],
  controllers: [UsersController],
  providers: [
    CompanyUsersService,
    UserAccountsService,
    { provide: CompanyUserRepository, useClass: PrismaCompanyUserRepository },
  ],
  // Employees lo usa para dar acceso a la app a un empleado
  exports: [UserAccountsService],
})
export class UsersModule {}
