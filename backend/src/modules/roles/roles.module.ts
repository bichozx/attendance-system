import { Module } from '@nestjs/common';
import { PrismaRoleRepository } from './infrastructure/prisma-role.repository';
import { RoleRepository } from './domain/role.repository';
import { RolesController } from './presentation/roles.controller';
import { RolesService } from './application/roles.service';

@Module({
  controllers: [RolesController],
  providers: [
    RolesService,
    { provide: RoleRepository, useClass: PrismaRoleRepository },
  ],
  // Users y Employees necesitan resolver roles asignables
  exports: [RoleRepository],
})
export class RolesModule {}
