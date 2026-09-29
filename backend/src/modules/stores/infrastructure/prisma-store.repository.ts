import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { PageRequest, toSkipTake } from '../../../shared/application/page';
import { isUniqueViolation } from '../../../shared/infrastructure/prisma/prisma-errors';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import {
  GeofenceNotFoundError,
  StoreCodeTakenError,
  StoreNotFoundError,
} from '../domain/store.errors';
import { StoreRepository } from '../domain/store.repository';
import type {
  GeofenceChanges,
  GeofenceData,
  GeofenceView,
  StoreChanges,
  StoreData,
  StoreDetailView,
  StoreFilter,
  StoreView,
} from '../domain/store.types';

const GEOFENCE_SELECT = {
  id: true,
  storeId: true,
  name: true,
  centerLatitude: true,
  centerLongitude: true,
  radiusMeters: true,
  maxAccuracyMeters: true,
  isActive: true,
} satisfies Prisma.GeofenceSelect;

const STORE_SELECT = {
  id: true,
  code: true,
  name: true,
  address: true,
  city: true,
  latitude: true,
  longitude: true,
  timezone: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { geofences: { where: { isActive: true } } } },
} satisfies Prisma.StoreSelect;

const DETAIL_SELECT = {
  ...STORE_SELECT,
  geofences: { select: GEOFENCE_SELECT, orderBy: { createdAt: 'asc' } },
} satisfies Prisma.StoreSelect;

type StoreRow = Prisma.StoreGetPayload<{ select: typeof STORE_SELECT }>;
type DetailRow = Prisma.StoreGetPayload<{ select: typeof DETAIL_SELECT }>;

const toView = ({ _count, ...row }: StoreRow): StoreView => ({
  ...row,
  activeGeofences: _count.geofences,
});
const toDetail = ({ geofences, ...row }: DetailRow): StoreDetailView => ({
  ...toView(row),
  geofences,
});

const scope = (companyId: string) => ({ companyId, deletedAt: null });

@Injectable()
export class PrismaStoreRepository extends StoreRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(
    companyId: string,
    filter: StoreFilter,
    page: PageRequest,
  ): Promise<{ items: StoreView[]; total: number }> {
    const search = filter.search?.trim();
    const where: Prisma.StoreWhereInput = {
      ...scope(companyId),
      isActive: filter.isActive,
      ...(filter.city && {
        city: { equals: filter.city, mode: 'insensitive' },
      }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { code: { contains: search, mode: 'insensitive' } },
          { address: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.store.findMany({
        where,
        select: STORE_SELECT,
        orderBy: { name: 'asc' },
        ...toSkipTake(page),
      }),
      this.prisma.store.count({ where }),
    ]);
    return { items: rows.map(toView), total };
  }

  async findById(
    companyId: string,
    id: string,
  ): Promise<StoreDetailView | null> {
    const row = await this.prisma.store.findFirst({
      where: { id, ...scope(companyId) },
      select: DETAIL_SELECT,
    });
    return row ? toDetail(row) : null;
  }

  async findIdByCode(companyId: string, code: string): Promise<string | null> {
    const row = await this.prisma.store.findUnique({
      where: { companyId_code: { companyId, code } },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  async create(
    companyId: string,
    data: StoreData,
    initialGeofence: GeofenceData,
  ): Promise<StoreDetailView> {
    try {
      const row = await this.prisma.store.create({
        data: {
          ...data,
          companyId,
          geofences: { create: { ...initialGeofence, companyId } },
        },
        select: DETAIL_SELECT,
      });
      return toDetail(row);
    } catch (error) {
      if (isUniqueViolation(error)) throw new StoreCodeTakenError(data.code);
      throw error;
    }
  }

  async update(
    companyId: string,
    id: string,
    changes: StoreChanges,
  ): Promise<StoreDetailView> {
    try {
      const { count } = await this.prisma.store.updateMany({
        where: { id, ...scope(companyId) },
        data: changes,
      });
      if (count === 0) throw new StoreNotFoundError();
    } catch (error) {
      if (isUniqueViolation(error))
        throw new StoreCodeTakenError(changes.code ?? '');
      throw error;
    }
    return (await this.findById(companyId, id))!;
  }

  findGeofence(
    companyId: string,
    storeId: string,
    id: string,
  ): Promise<GeofenceView | null> {
    return this.prisma.geofence.findFirst({
      where: { id, storeId, companyId },
      select: GEOFENCE_SELECT,
    });
  }

  createGeofence(
    companyId: string,
    storeId: string,
    data: GeofenceData,
  ): Promise<GeofenceView> {
    return this.prisma.geofence.create({
      data: { ...data, companyId, storeId },
      select: GEOFENCE_SELECT,
    });
  }

  async updateGeofence(
    companyId: string,
    id: string,
    changes: GeofenceChanges,
  ): Promise<GeofenceView> {
    const { count } = await this.prisma.geofence.updateMany({
      where: { id, companyId },
      data: changes,
    });
    if (count === 0) throw new GeofenceNotFoundError();
    return this.prisma.geofence.findUniqueOrThrow({
      where: { id },
      select: GEOFENCE_SELECT,
    });
  }

  async deleteGeofence(companyId: string, id: string): Promise<void> {
    await this.prisma.geofence.deleteMany({ where: { id, companyId } });
  }

  countGeofenceEvents(companyId: string, id: string): Promise<number> {
    return this.prisma.attendanceEvent.count({
      where: { companyId, geofenceId: id },
    });
  }
}
