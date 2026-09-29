import { Injectable } from '@nestjs/common';
import { isUniqueViolation } from '../../../shared/infrastructure/prisma/prisma-errors';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import {
  PositionNameTakenError,
  PositionNotFoundError,
} from '../domain/employee.errors';
import type { PositionView } from '../domain/employee.types';
import { PositionRepository } from '../domain/position.repository';

const SELECT = {
  id: true,
  name: true,
  description: true,
  isActive: true,
} as const;

@Injectable()
export class PrismaPositionRepository extends PositionRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  list(companyId: string, includeInactive: boolean): Promise<PositionView[]> {
    return this.prisma.position.findMany({
      where: { companyId, ...(includeInactive ? {} : { isActive: true }) },
      select: SELECT,
      orderBy: { name: 'asc' },
    });
  }

  findById(companyId: string, id: string): Promise<PositionView | null> {
    return this.prisma.position.findFirst({
      where: { id, companyId },
      select: SELECT,
    });
  }

  async findIdByName(companyId: string, name: string): Promise<string | null> {
    const row = await this.prisma.position.findFirst({
      where: { companyId, name: { equals: name, mode: 'insensitive' } },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  async create(
    companyId: string,
    data: { name: string; description: string | null },
  ): Promise<PositionView> {
    try {
      return await this.prisma.position.create({
        data: { ...data, companyId },
        select: SELECT,
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new PositionNameTakenError(data.name);
      throw error;
    }
  }

  async update(
    companyId: string,
    id: string,
    changes: { name?: string; description?: string | null; isActive?: boolean },
  ): Promise<PositionView> {
    try {
      const { count } = await this.prisma.position.updateMany({
        where: { id, companyId },
        data: changes,
      });
      if (count === 0) throw new PositionNotFoundError();
    } catch (error) {
      if (isUniqueViolation(error))
        throw new PositionNameTakenError(changes.name ?? '');
      throw error;
    }
    return (await this.findById(companyId, id))!;
  }
}
