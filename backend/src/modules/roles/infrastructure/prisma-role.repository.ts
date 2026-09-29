import { Injectable } from '@nestjs/common';
import { isUniqueViolation } from '../../../shared/infrastructure/prisma/prisma-errors';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { RoleCodeTakenError, RoleNotFoundError } from '../domain/role.errors';
import { RoleRepository } from '../domain/role.repository';
import type {
  NewRoleData,
  PermissionView,
  RoleChanges,
  RoleView,
} from '../domain/role.types';

const ROLE_SELECT = {
  id: true,
  code: true,
  name: true,
  description: true,
  isSystem: true,
  permissions: {
    select: { permission: { select: { code: true } } },
    orderBy: { permission: { code: 'asc' } },
  },
} as const;

type RoleRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: { permission: { code: string } }[];
};

const toView = (row: RoleRow): RoleView => ({
  id: row.id,
  code: row.code,
  name: row.name,
  description: row.description,
  isSystem: row.isSystem,
  permissions: row.permissions.map((p) => p.permission.code),
});

/** Roles del sistema (companyId null) o propios de la empresa. */
const visibleTo = (companyId: string) => ({
  OR: [{ companyId: null }, { companyId }],
});

@Injectable()
export class PrismaRoleRepository extends RoleRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async listVisible(companyId: string): Promise<RoleView[]> {
    const rows = await this.prisma.role.findMany({
      where: visibleTo(companyId),
      select: ROLE_SELECT,
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
    return rows.map(toView);
  }

  async findVisible(companyId: string, id: string): Promise<RoleView | null> {
    const row = await this.prisma.role.findFirst({
      where: { id, ...visibleTo(companyId) },
      select: ROLE_SELECT,
    });
    return row ? toView(row) : null;
  }

  async findVisibleByCode(
    companyId: string,
    code: string,
  ): Promise<RoleView | null> {
    const row = await this.prisma.role.findFirst({
      where: { code, ...visibleTo(companyId) },
      select: ROLE_SELECT,
      orderBy: { isSystem: 'asc' }, // Si coincide, prioriza el propio de la empresa
    });
    return row ? toView(row) : null;
  }

  listPermissions(): Promise<PermissionView[]> {
    return this.prisma.permission.findMany({
      select: { code: true, module: true, description: true },
      orderBy: [{ module: 'asc' }, { code: 'asc' }],
    });
  }

  async findExistingPermissionCodes(codes: string[]): Promise<string[]> {
    const rows = await this.prisma.permission.findMany({
      where: { code: { in: codes } },
      select: { code: true },
    });
    return rows.map((r) => r.code);
  }

  async create(companyId: string, data: NewRoleData): Promise<RoleView> {
    try {
      const row = await this.prisma.role.create({
        data: {
          companyId,
          code: data.code,
          name: data.name,
          description: data.description,
          permissions: {
            create: data.permissions.map((code) => ({
              permission: { connect: { code } },
            })),
          },
        },
        select: ROLE_SELECT,
      });
      return toView(row);
    } catch (error) {
      if (isUniqueViolation(error)) throw new RoleCodeTakenError(data.code);
      throw error;
    }
  }

  async update(
    companyId: string,
    id: string,
    changes: RoleChanges,
  ): Promise<RoleView> {
    return this.prisma.$transaction(async (tx) => {
      // updateMany con companyId: si el rol no es de esta empresa, no toca nada.
      const { count } = await tx.role.updateMany({
        where: { id, companyId },
        data: { name: changes.name, description: changes.description },
      });
      if (count === 0) throw new RoleNotFoundError();

      if (changes.permissions) {
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        const permissions = await tx.permission.findMany({
          where: { code: { in: changes.permissions } },
          select: { id: true },
        });
        await tx.rolePermission.createMany({
          data: permissions.map((p) => ({ roleId: id, permissionId: p.id })),
        });
      }

      const row = await tx.role.findUniqueOrThrow({
        where: { id },
        select: ROLE_SELECT,
      });
      return toView(row);
    });
  }

  async delete(companyId: string, id: string): Promise<void> {
    await this.prisma.role.deleteMany({ where: { id, companyId } });
  }

  countMembers(companyId: string, roleId: string): Promise<number> {
    return this.prisma.companyMembership.count({
      where: { companyId, roleId },
    });
  }
}
