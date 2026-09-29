import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { PageRequest, toSkipTake } from '../../../shared/application/page';
import { isUniqueViolation } from '../../../shared/infrastructure/prisma/prisma-errors';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import {
  EmployeeCodeTakenError,
  EmployeeDocumentTakenError,
  EmployeeNotFoundError,
  UserAlreadyLinkedError,
} from '../domain/employee.errors';
import { EmployeeRepository } from '../domain/employee.repository';
import { blocksAppAccess } from '../domain/employee.rules';
import type {
  DocumentType,
  EmployeeChanges,
  EmployeeData,
  EmployeeFilter,
  EmployeeView,
  StatusChange,
} from '../domain/employee.types';

const EMPLOYEE_SELECT = {
  id: true,
  code: true,
  documentType: true,
  documentNumber: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  birthDate: true,
  hireDate: true,
  terminationDate: true,
  status: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
  position: { select: { id: true, name: true } },
  defaultStore: { select: { id: true, name: true } },
} satisfies Prisma.EmployeeSelect;

/** Condición base: la empresa y no eliminado. */
const scope = (companyId: string) => ({ companyId, deletedAt: null });

@Injectable()
export class PrismaEmployeeRepository extends EmployeeRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(
    companyId: string,
    filter: EmployeeFilter,
    page: PageRequest,
  ): Promise<{ items: EmployeeView[]; total: number }> {
    const search = filter.search?.trim();
    const where: Prisma.EmployeeWhereInput = {
      ...scope(companyId),
      status: filter.status,
      positionId: filter.positionId,
      defaultStoreId: filter.storeId,
      ...(search && {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { code: { contains: search, mode: 'insensitive' } },
          { documentNumber: { contains: search } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.employee.findMany({
        where,
        select: EMPLOYEE_SELECT,
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        ...toSkipTake(page),
      }),
      this.prisma.employee.count({ where }),
    ]);
    return { items, total };
  }

  findById(companyId: string, id: string): Promise<EmployeeView | null> {
    return this.prisma.employee.findFirst({
      where: { id, ...scope(companyId) },
      select: EMPLOYEE_SELECT,
    });
  }

  async findIdByCode(companyId: string, code: string): Promise<string | null> {
    const row = await this.prisma.employee.findUnique({
      where: { companyId_code: { companyId, code } },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  async findIdByDocument(
    companyId: string,
    documentType: DocumentType,
    documentNumber: string,
  ): Promise<string | null> {
    const row = await this.prisma.employee.findUnique({
      where: {
        companyId_documentType_documentNumber: {
          companyId,
          documentType,
          documentNumber,
        },
      },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  async findIdByUserId(
    companyId: string,
    userId: string,
  ): Promise<string | null> {
    const row = await this.prisma.employee.findUnique({
      where: { companyId_userId: { companyId, userId } },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  async positionExists(companyId: string, id: string): Promise<boolean> {
    return (await this.prisma.position.count({ where: { id, companyId } })) > 0;
  }

  async storeExists(companyId: string, id: string): Promise<boolean> {
    return (
      (await this.prisma.store.count({
        where: { id, companyId, deletedAt: null },
      })) > 0
    );
  }

  async create(companyId: string, data: EmployeeData): Promise<EmployeeView> {
    try {
      return await this.prisma.employee.create({
        data: { ...data, companyId },
        select: EMPLOYEE_SELECT,
      });
    } catch (error) {
      throw mapUniqueError(error, data.code);
    }
  }

  async update(
    companyId: string,
    id: string,
    changes: EmployeeChanges,
  ): Promise<EmployeeView> {
    try {
      const { count } = await this.prisma.employee.updateMany({
        where: { id, ...scope(companyId) },
        data: changes,
      });
      if (count === 0) throw new EmployeeNotFoundError();
    } catch (error) {
      throw mapUniqueError(error, changes.code);
    }
    return (await this.findById(companyId, id))!;
  }

  async changeStatus(
    companyId: string,
    id: string,
    change: StatusChange,
  ): Promise<EmployeeView> {
    return this.prisma.$transaction(async (tx) => {
      const employee = await tx.employee.update({
        where: { id, companyId },
        data: change,
        select: EMPLOYEE_SELECT,
      });

      if (employee.userId) {
        const membership = {
          companyId_userId: { companyId, userId: employee.userId },
        };
        if (blocksAppAccess(change.status)) {
          await tx.companyMembership.update({
            where: membership,
            data: { status: 'DISABLED' },
          });
          await tx.session.updateMany({
            where: { companyId, userId: employee.userId, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        } else if (change.status === 'ACTIVE') {
          await tx.companyMembership.update({
            where: membership,
            data: { status: 'ACTIVE' },
          });
        }
      }
      return employee;
    });
  }

  async linkUser(companyId: string, id: string, userId: string): Promise<void> {
    try {
      const { count } = await this.prisma.employee.updateMany({
        where: { id, userId: null, ...scope(companyId) },
        data: { userId },
      });
      if (count === 0) throw new EmployeeNotFoundError();
    } catch (error) {
      if (isUniqueViolation(error)) throw new UserAlreadyLinkedError();
      throw error;
    }
  }
}

function mapUniqueError(error: unknown, code?: string): unknown {
  if (!isUniqueViolation(error)) return error;
  const target = JSON.stringify((error as { meta?: unknown }).meta ?? '');
  return target.includes('document')
    ? new EmployeeDocumentTakenError()
    : new EmployeeCodeTakenError(code ?? '');
}
