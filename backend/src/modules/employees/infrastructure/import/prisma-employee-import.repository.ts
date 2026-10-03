import { Injectable } from '@nestjs/common';
import { parseDateOnly } from '../../../../shared/domain/date-only';
import { isUniqueViolation } from '../../../../shared/infrastructure/prisma/prisma-errors';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import { EmployeeImportRepository } from '../../domain/import/employee-import.repository';
import type {
  ImportContext,
  ImportedEmployee,
} from '../../domain/import/employee-import.rules';
import { normalize } from '../../domain/import/values';
import { ImportFileError } from './spreadsheet.io';

@Injectable()
export class PrismaEmployeeImportRepository extends EmployeeImportRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async context(companyId: string, today: string): Promise<ImportContext> {
    const [employees, positions, stores] = await Promise.all([
      this.prisma.employee.findMany({
        where: { companyId },
        select: { code: true, documentType: true, documentNumber: true },
      }),
      this.prisma.position.findMany({
        where: { companyId, isActive: true },
        select: { id: true, name: true },
      }),
      this.prisma.store.findMany({
        where: { companyId, deletedAt: null, isActive: true },
        select: { id: true, code: true },
      }),
    ]);
    return {
      existingCodes: new Set(employees.map((e) => e.code)),
      existingDocuments: new Set(
        employees.map((e) => `${e.documentType}:${e.documentNumber}`),
      ),
      positions: new Map(positions.map((p) => [normalize(p.name), p.id])),
      stores: new Map(stores.map((s) => [s.code.toUpperCase(), s.id])),
      today,
    };
  }

  async templateLists(companyId: string) {
    const [positions, stores] = await Promise.all([
      this.prisma.position.findMany({
        where: { companyId, isActive: true },
        select: { name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.store.findMany({
        where: { companyId, deletedAt: null, isActive: true },
        select: { code: true, name: true },
        orderBy: { code: 'asc' },
      }),
    ]);
    return { positions: positions.map((p) => p.name), stores };
  }

  async createMany(
    companyId: string,
    employees: ImportedEmployee[],
  ): Promise<Map<string, string>> {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const ids = new Map<string, string>();
          for (const e of employees) {
            const created = await tx.employee.create({
              data: {
                companyId,
                code: e.code,
                documentType: e.documentType,
                documentNumber: e.documentNumber,
                firstName: e.firstName,
                lastName: e.lastName,
                email: e.email,
                phone: e.phone,
                birthDate: e.birthDate ? parseDateOnly(e.birthDate) : null,
                hireDate: parseDateOnly(e.hireDate),
                positionId: e.positionId,
                defaultStoreId: e.storeId,
                ...(e.contract && {
                  contracts: {
                    create: {
                      companyId,
                      contractType: e.contract.contractType,
                      startDate: parseDateOnly(e.hireDate),
                      endDate: e.contract.endDate
                        ? parseDateOnly(e.contract.endDate)
                        : null,
                      baseSalary: e.contract.baseSalary,
                      weeklyHours: e.contract.weeklyHours,
                    },
                  },
                }),
              },
              select: { id: true },
            });
            ids.set(e.code, created.id);
          }
          return ids;
        },
        { timeout: 120_000 },
      );
    } catch (error) {
      // Alguien creó el mismo código o documento mientras se importaba: nada se guardó
      if (isUniqueViolation(error)) {
        throw new ImportFileError(
          'Otro usuario creó un empleado con el mismo código o documento. Vuelva a validar el archivo.',
        );
      }
      throw error;
    }
  }

  async companyTimeZone(companyId: string) {
    return (
      await this.prisma.company.findUniqueOrThrow({
        where: { id: companyId },
        select: { timezone: true },
      })
    ).timezone;
  }
}
