import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import {
  formatDateOnly,
  parseDateOnly,
} from '../../../shared/domain/date-only';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import {
  ContractRepository,
  ContractView,
  NewContract,
} from '../domain/contract.repository';
import { ContractNotFoundError } from '../domain/contract.rules';

const SELECT = {
  id: true,
  employeeId: true,
  contractType: true,
  startDate: true,
  endDate: true,
  baseSalary: true,
  currency: true,
  weeklyHours: true,
  notes: true,
  createdAt: true,
} satisfies Prisma.EmploymentContractSelect;

type Row = Prisma.EmploymentContractGetPayload<{ select: typeof SELECT }>;

const toView = (r: Row): ContractView => ({
  ...r,
  startDate: formatDateOnly(r.startDate),
  endDate: r.endDate ? formatDateOnly(r.endDate) : null,
  baseSalary: r.baseSalary.toFixed(2),
  weeklyHours: r.weeklyHours.toFixed(2),
});

@Injectable()
export class PrismaContractRepository extends ContractRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(companyId: string, employeeId: string) {
    const rows = await this.prisma.employmentContract.findMany({
      where: { companyId, employeeId },
      select: SELECT,
      orderBy: { startDate: 'desc' },
    });
    return rows.map(toView);
  }

  async findById(companyId: string, employeeId: string, id: string) {
    const row = await this.prisma.employmentContract.findFirst({
      where: { id, companyId, employeeId },
      select: SELECT,
    });
    return row ? toView(row) : null;
  }

  async create(
    companyId: string,
    employeeId: string,
    data: NewContract,
    close: { id: string; endDate: string } | null,
  ) {
    return this.prisma.$transaction(async (tx) => {
      if (close) {
        // Condicional: si alguien lo cerró entretanto, no se pisa
        const { count } = await tx.employmentContract.updateMany({
          where: { id: close.id, companyId, employeeId, endDate: null },
          data: { endDate: parseDateOnly(close.endDate) },
        });
        if (count !== 1) throw new ContractNotFoundError();
      }
      const row = await tx.employmentContract.create({
        data: {
          companyId,
          employeeId,
          contractType: data.contractType,
          startDate: parseDateOnly(data.startDate),
          endDate: data.endDate ? parseDateOnly(data.endDate) : null,
          baseSalary: data.baseSalary,
          weeklyHours: data.weeklyHours,
          notes: data.notes,
        },
        select: SELECT,
      });
      return toView(row);
    });
  }

  async update(
    companyId: string,
    id: string,
    changes: { notes?: string | null; endDate?: string | null },
  ) {
    const { count } = await this.prisma.employmentContract.updateMany({
      where: { id, companyId },
      data: {
        notes: changes.notes,
        endDate:
          changes.endDate === undefined
            ? undefined
            : changes.endDate
              ? parseDateOnly(changes.endDate)
              : null,
      },
    });
    if (count === 0) throw new ContractNotFoundError();
    return toView(
      await this.prisma.employmentContract.findUniqueOrThrow({
        where: { id },
        select: SELECT,
      }),
    );
  }
}
