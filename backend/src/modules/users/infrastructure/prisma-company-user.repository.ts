import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { PageRequest, toSkipTake } from '../../../shared/application/page';
import { isUniqueViolation } from '../../../shared/infrastructure/prisma/prisma-errors';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { CompanyUserRepository } from '../domain/company-user.repository';
import type {
  CompanyUserFilter,
  CompanyUserView,
  MembershipStatus,
  NewAccount,
} from '../domain/company-user.types';
import { UserAlreadyMemberError } from '../domain/user.errors';

const memberSelect = (companyId: string) =>
  ({
    status: true,
    createdAt: true,
    role: { select: { id: true, code: true, name: true } },
    user: {
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        status: true,
        lastLoginAt: true,
        // Solo el empleado de ESTA empresa
        employees: { where: { companyId }, select: { id: true }, take: 1 },
      },
    },
  }) satisfies Prisma.CompanyMembershipSelect;

type MemberRow = Prisma.CompanyMembershipGetPayload<{
  select: ReturnType<typeof memberSelect>;
}>;

const toView = (row: MemberRow): CompanyUserView => ({
  id: row.user.id,
  email: row.user.email,
  firstName: row.user.firstName,
  lastName: row.user.lastName,
  phone: row.user.phone,
  accountStatus: row.user.status,
  membershipStatus: row.status,
  role: row.role,
  employeeId: row.user.employees[0]?.id ?? null,
  lastLoginAt: row.user.lastLoginAt,
  memberSince: row.createdAt,
});

@Injectable()
export class PrismaCompanyUserRepository extends CompanyUserRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(
    companyId: string,
    filter: CompanyUserFilter,
    page: PageRequest,
  ): Promise<{ items: CompanyUserView[]; total: number }> {
    const search = filter.search?.trim();
    const where: Prisma.CompanyMembershipWhereInput = {
      companyId,
      status: filter.status,
      roleId: filter.roleId,
      ...(search && {
        user: {
          OR: [
            { email: { contains: search, mode: 'insensitive' } },
            { firstName: { contains: search, mode: 'insensitive' } },
            { lastName: { contains: search, mode: 'insensitive' } },
          ],
        },
      }),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.companyMembership.findMany({
        where,
        select: memberSelect(companyId),
        orderBy: [
          { user: { firstName: 'asc' } },
          { user: { lastName: 'asc' } },
        ],
        ...toSkipTake(page),
      }),
      this.prisma.companyMembership.count({ where }),
    ]);
    return { items: rows.map(toView), total };
  }

  async findById(
    companyId: string,
    userId: string,
  ): Promise<CompanyUserView | null> {
    const row = await this.prisma.companyMembership.findUnique({
      where: { companyId_userId: { companyId, userId } },
      select: memberSelect(companyId),
    });
    return row ? toView(row) : null;
  }

  async findUserIdByEmail(email: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    return user?.id ?? null;
  }

  async createAccountWithMembership(
    companyId: string,
    account: NewAccount,
    roleId: string,
  ): Promise<string> {
    try {
      const user = await this.prisma.user.create({
        data: {
          ...account,
          memberships: { create: { companyId, roleId } },
        },
        select: { id: true },
      });
      return user.id;
    } catch (error) {
      // Otra petición creó el mismo correo al mismo tiempo
      if (isUniqueViolation(error)) throw new UserAlreadyMemberError();
      throw error;
    }
  }

  async addMembership(
    companyId: string,
    userId: string,
    roleId: string,
  ): Promise<void> {
    try {
      await this.prisma.companyMembership.create({
        data: { companyId, userId, roleId },
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new UserAlreadyMemberError();
      throw error;
    }
  }

  async updateMembership(
    companyId: string,
    userId: string,
    changes: { roleId?: string; status?: MembershipStatus },
  ): Promise<void> {
    await this.prisma.companyMembership.update({
      where: { companyId_userId: { companyId, userId } },
      data: changes,
    });
  }

  async revokeCompanySessions(
    companyId: string,
    userId: string,
  ): Promise<void> {
    await this.prisma.session.updateMany({
      where: { userId, companyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async companyName(companyId: string): Promise<string> {
    const c = await this.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { name: true },
    });
    return c.name;
  }
}
