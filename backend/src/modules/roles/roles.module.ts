import { Module } from '@nestjs/common';
import { RolesService } from './application/roles.service';
import { RoleRepository } from './domain/role.repository';
import { PrismaRoleRepository } from './infrastructure/prisma-role.repository';
import { RolesController } from './presentation/roles.controller';

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
