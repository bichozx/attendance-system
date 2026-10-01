import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { PageRequest, toSkipTake } from '../../../shared/application/page';
import { isUniqueViolation } from '../../../shared/infrastructure/prisma/prisma-errors';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import {
  CompanyNotFoundError,
  CompanySlugTakenError,
  CompanyTaxIdTakenError,
} from '../domain/company.errors';
import { CompanyRepository } from '../domain/company.repository';
import type {
  CompanyFilter,
  CompanyLegalChanges,
  CompanyStatus,
  CompanyView,
  NewCompany,
  PlatformCompanyDetail,
  PlatformCompanyView,
} from '../domain/company.types';

const COMPANY_SELECT = {
  id: true,
  name: true,
  legalName: true,
  taxId: true,
  slug: true,
  country: true,
  timezone: true,
  currency: true,
  status: true,
  defaultEarlyClockInMinutes: true,
  defaultLateToleranceMinutes: true,
  defaultBreakMinutes: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CompanySelect;

const WITH_STATS = {
  ...COMPANY_SELECT,
  _count: {
    select: {
      employees: { where: { status: 'ACTIVE', deletedAt: null } },
      memberships: { where: { status: 'ACTIVE' } },
      stores: { where: { deletedAt: null } },
    },
  },
} satisfies Prisma.CompanySelect;

type CompanyRow = Prisma.CompanyGetPayload<{ select: typeof COMPANY_SELECT }>;
type StatsRow = Prisma.CompanyGetPayload<{ select: typeof WITH_STATS }>;

function toView(row: CompanyRow): CompanyView {
  const {
    defaultEarlyClockInMinutes,
    defaultLateToleranceMinutes,
    defaultBreakMinutes,
    ...rest
  } = row;
  return {
    ...rest,
    shiftDefaults: {
      earlyClockInMinutes: defaultEarlyClockInMinutes,
      lateToleranceMinutes: defaultLateToleranceMinutes,
      breakMinutes: defaultBreakMinutes,
    },
  };
}

function toPlatformView({ _count, ...row }: StatsRow): PlatformCompanyView {
  return {
    ...toView(row),
    stats: {
      activeEmployees: _count.employees,
      activeUsers: _count.memberships,
      stores: _count.stores,
    },
  };
}

/** Traduce los cambios del dominio a columnas. */
function toData(changes: CompanyLegalChanges): Prisma.CompanyUpdateInput {
  const { shiftDefaults, ...rest } = changes;
  return {
    ...rest,
    defaultEarlyClockInMinutes: shiftDefaults?.earlyClockInMinutes,
    defaultLateToleranceMinutes: shiftDefaults?.lateToleranceMinutes,
    defaultBreakMinutes: shiftDefaults?.breakMinutes,
  };
}

function mapUnique(error: unknown, slug?: string): unknown {
  if (!isUniqueViolation(error)) return error;
  const target = JSON.stringify((error as { meta?: unknown }).meta ?? '');
  return target.includes('taxId')
    ? new CompanyTaxIdTakenError()
    : new CompanySlugTakenError(slug ?? '');
}

@Injectable()
export class PrismaCompanyRepository extends CompanyRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findById(id: string): Promise<CompanyView | null> {
    const row = await this.prisma.company.findFirst({
      where: { id, deletedAt: null },
      select: COMPANY_SELECT,
    });
    return row ? toView(row) : null;
  }

  async list(filter: CompanyFilter, page: PageRequest) {
    const search = filter.search?.trim();
    const where: Prisma.CompanyWhereInput = {
      deletedAt: null,
      status: filter.status,
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { legalName: { contains: search, mode: 'insensitive' } },
          { slug: { contains: search.toLowerCase() } },
          { taxId: { contains: search } },
        ],
      }),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.company.findMany({
        where,
        select: WITH_STATS,
        orderBy: { createdAt: 'desc' },
        ...toSkipTake(page),
      }),
      this.prisma.company.count({ where }),
    ]);
    return { items: rows.map(toPlatformView), total };
  }

  async findDetail(id: string): Promise<PlatformCompanyDetail | null> {
    const row = await this.prisma.company.findFirst({
      where: { id, deletedAt: null },
      select: {
        ...WITH_STATS,
        memberships: {
          where: { role: { code: 'COMPANY_ADMIN' } },
          select: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                lastLoginAt: true,
              },
            },
          },
        },
      },
    });
    if (!row) return null;
    const { memberships, ...rest } = row;
    return {
      ...toPlatformView(rest),
      admins: memberships.map(({ user }) => ({
        userId: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        hasLoggedIn: user.lastLoginAt !== null,
      })),
    };
  }

  async slugExists(slug: string, excludeId?: string): Promise<boolean> {
    const n = await this.prisma.company.count({
      where: { slug, ...(excludeId && { id: { not: excludeId } }) },
    });
    return n > 0;
  }

  async taxIdExists(
    country: string,
    taxId: string,
    excludeId?: string,
  ): Promise<boolean> {
    const n = await this.prisma.company.count({
      where: { country, taxId, ...(excludeId && { id: { not: excludeId } }) },
    });
    return n > 0;
  }

  findUserByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, firstName: true },
    });
  }

  async createWithAdmin(
    data: NewCompany,
    admin: {
      existingUserId?: string;
      newUser?: {
        email: string;
        firstName: string;
        lastName: string;
        passwordHash: string;
      };
    },
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const role = await tx.role.findFirstOrThrow({
          where: { companyId: null, code: 'COMPANY_ADMIN' },
          select: { id: true },
        });
        const company = await tx.company.create({
          data,
          select: COMPANY_SELECT,
        });
        const adminUserId =
          admin.existingUserId ??
          (await tx.user.create({ data: admin.newUser!, select: { id: true } }))
            .id;
        await tx.companyMembership.create({
          data: { companyId: company.id, userId: adminUserId, roleId: role.id },
        });
        return { company: toView(company), adminUserId };
      });
    } catch (error) {
      throw mapUnique(error, data.slug);
    }
  }

  async update(id: string, changes: CompanyLegalChanges): Promise<CompanyView> {
    try {
      const { count } = await this.prisma.company.updateMany({
        where: { id, deletedAt: null },
        data: toData(changes) as Prisma.CompanyUpdateManyMutationInput,
      });
      if (count === 0) throw new CompanyNotFoundError();
    } catch (error) {
      throw mapUnique(error, changes.slug);
    }
    return (await this.findById(id))!;
  }

  async setStatus(id: string, status: CompanyStatus): Promise<CompanyView> {
    const { count } = await this.prisma.company.updateMany({
      where: { id, deletedAt: null },
      data: { status },
    });
    if (count === 0) throw new CompanyNotFoundError();
    return (await this.findById(id))!;
  }

  async revokeCompanySessions(id: string): Promise<number> {
    const { count } = await this.prisma.session.updateMany({
      where: { companyId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return count;
  }
}
