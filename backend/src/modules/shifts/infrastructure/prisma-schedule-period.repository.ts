import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { PageRequest, toSkipTake } from '../../../shared/application/page';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { PeriodNotFoundError } from '../domain/shift.errors';
import { SchedulePeriodRepository } from '../domain/shift.repository';
import type {
  NewPeriod,
  PeriodFilter,
  PeriodStatus,
  PeriodView,
} from '../domain/shift.types';

const PERIOD_SELECT = {
  id: true,
  storeId: true,
  name: true,
  startDate: true,
  endDate: true,
  status: true,
  publishedAt: true,
  createdAt: true,
  store: { select: { name: true } },
  _count: { select: { shifts: { where: { status: 'SCHEDULED' } } } },
} satisfies Prisma.SchedulePeriodSelect;

type PeriodRow = Prisma.SchedulePeriodGetPayload<{
  select: typeof PERIOD_SELECT;
}>;

const toView = ({ store, _count, ...row }: PeriodRow): PeriodView => ({
  ...row,
  storeName: store?.name ?? null,
  shiftCount: _count.shifts,
});

@Injectable()
export class PrismaSchedulePeriodRepository extends SchedulePeriodRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(companyId: string, filter: PeriodFilter, page: PageRequest) {
    const where: Prisma.SchedulePeriodWhereInput = {
      companyId,
      status: filter.status,
      ...(filter.storeId && {
        OR: [{ storeId: filter.storeId }, { storeId: null }],
      }),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.schedulePeriod.findMany({
        where,
        select: PERIOD_SELECT,
        orderBy: { startDate: 'desc' },
        ...toSkipTake(page),
      }),
      this.prisma.schedulePeriod.count({ where }),
    ]);
    return { items: rows.map(toView), total };
  }

  async findById(companyId: string, id: string): Promise<PeriodView | null> {
    const row = await this.prisma.schedulePeriod.findFirst({
      where: { id, companyId },
      select: PERIOD_SELECT,
    });
    return row ? toView(row) : null;
  }

  /**
   * Alcances que chocan: la misma tienda, o cualquiera de los dos es de toda la empresa.
   * Así nunca hay dos programaciones vigentes para el mismo lugar y fecha.
   */
  findOverlapping(companyId: string, candidate: NewPeriod, excludeId?: string) {
    return this.prisma.schedulePeriod.findFirst({
      where: {
        companyId,
        id: excludeId ? { not: excludeId } : undefined,
        startDate: { lte: candidate.endDate },
        endDate: { gte: candidate.startDate },
        ...(candidate.storeId && {
          OR: [{ storeId: null }, { storeId: candidate.storeId }],
        }),
      },
      select: { id: true, name: true },
    });
  }

  async create(companyId: string, data: NewPeriod): Promise<PeriodView> {
    const row = await this.prisma.schedulePeriod.create({
      data: { ...data, companyId },
      select: PERIOD_SELECT,
    });
    return toView(row);
  }

  async update(companyId: string, id: string, changes: Partial<NewPeriod>) {
    const { count } = await this.prisma.schedulePeriod.updateMany({
      where: { id, companyId },
      data: changes,
    });
    if (count === 0) throw new PeriodNotFoundError();
    return (await this.findById(companyId, id))!;
  }

  async setStatus(
    companyId: string,
    id: string,
    status: PeriodStatus,
    actorUserId: string,
  ) {
    const { count } = await this.prisma.schedulePeriod.updateMany({
      where: { id, companyId },
      data: {
        status,
        ...(status === 'PUBLISHED' && {
          publishedAt: new Date(),
          publishedById: actorUserId,
        }),
      },
    });
    if (count === 0) throw new PeriodNotFoundError();
    return (await this.findById(companyId, id))!;
  }

  async deleteWithShifts(companyId: string, id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const shiftFilter = { companyId, schedulePeriodId: id };
      await tx.shiftChange.deleteMany({
        where: { companyId, shiftAssignment: { shift: shiftFilter } },
      });
      await tx.shiftAssignment.deleteMany({
        where: { companyId, shift: shiftFilter },
      });
      await tx.shift.deleteMany({ where: shiftFilter });
      await tx.schedulePeriod.deleteMany({ where: { id, companyId } });
    });
  }

  countActiveShifts(companyId: string, id: string): Promise<number> {
    return this.prisma.shift.count({
      where: { companyId, schedulePeriodId: id, status: 'SCHEDULED' },
    });
  }

  async findAssignedUserIds(companyId: string, id: string): Promise<string[]> {
    const rows = await this.prisma.employee.findMany({
      where: {
        companyId,
        userId: { not: null },
        shiftAssignments: {
          some: {
            status: 'ASSIGNED',
            shift: { schedulePeriodId: id, status: 'SCHEDULED' },
          },
        },
      },
      select: { userId: true },
    });
    return rows.map((r) => r.userId!);
  }

  async companyTimeZone(companyId: string): Promise<string> {
    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { timezone: true },
    });
    return company.timezone;
  }
}
