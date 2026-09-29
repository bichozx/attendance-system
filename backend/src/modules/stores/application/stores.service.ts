import { Injectable } from '@nestjs/common';
import { Actor, AuditLog } from '../../../shared/application/audit-log';
import { PageRequest, toPage } from '../../../shared/application/page';
import { isValidTimeZone } from '../../../shared/domain/geo';
import {
  InvalidTimeZoneError,
  StoreCodeTakenError,
  StoreNotFoundError,
} from '../domain/store.errors';
import { StoreRepository } from '../domain/store.repository';
import type {
  StoreChanges,
  StoreData,
  StoreDetailView,
  StoreFilter,
} from '../domain/store.types';

export const DEFAULT_GEOFENCE_RADIUS_METERS = 100;
export const DEFAULT_MAX_ACCURACY_METERS = 50;

@Injectable()
export class StoresService {
  constructor(
    private readonly stores: StoreRepository,
    private readonly audit: AuditLog,
  ) {}

  async list(companyId: string, filter: StoreFilter, page: PageRequest) {
    const { items, total } = await this.stores.list(companyId, filter, page);
    return toPage(items, total, page);
  }

  async get(companyId: string, id: string): Promise<StoreDetailView> {
    const store = await this.stores.findById(companyId, id);
    if (!store) throw new StoreNotFoundError();
    return store;
  }

  /** Crea el establecimiento con una geocerca circular centrada en él. */
  async create(
    actor: Actor,
    data: StoreData,
    geofenceRadiusMeters = DEFAULT_GEOFENCE_RADIUS_METERS,
  ): Promise<StoreDetailView> {
    this.assertTimeZone(data.timezone);
    await this.assertCodeFree(actor.companyId, data.code);

    const store = await this.stores.create(actor.companyId, data, {
      name: `Perímetro ${data.name}`,
      centerLatitude: data.latitude,
      centerLongitude: data.longitude,
      radiusMeters: geofenceRadiusMeters,
      maxAccuracyMeters: DEFAULT_MAX_ACCURACY_METERS,
    });
    await this.record(actor, store.id, 'store.created', undefined, store);
    return store;
  }

  /**
   * Las geocercas NO se mueven al cambiar las coordenadas del establecimiento:
   * se ajustan por separado, para no mover por accidente un perímetro ya calibrado.
   */
  async update(
    actor: Actor,
    id: string,
    changes: StoreChanges,
  ): Promise<StoreDetailView> {
    const before = await this.get(actor.companyId, id);
    this.assertTimeZone(changes.timezone);
    if (changes.code)
      await this.assertCodeFree(actor.companyId, changes.code, id);

    const after = await this.stores.update(actor.companyId, id, changes);
    await this.record(
      actor,
      id,
      'store.updated',
      stripGeofences(before),
      stripGeofences(after),
    );
    return after;
  }

  private assertTimeZone(timeZone: string | null | undefined) {
    if (timeZone && !isValidTimeZone(timeZone)) {
      throw new InvalidTimeZoneError(timeZone);
    }
  }

  private async assertCodeFree(
    companyId: string,
    code: string,
    excludeId?: string,
  ) {
    const owner = await this.stores.findIdByCode(companyId, code);
    if (owner && owner !== excludeId) throw new StoreCodeTakenError(code);
  }

  private record(
    actor: Actor,
    id: string,
    action: string,
    before: unknown,
    after: unknown,
  ) {
    return this.audit.record({
      companyId: actor.companyId,
      actorUserId: actor.userId,
      action,
      entityType: 'Store',
      entityId: id,
      before,
      after,
    });
  }
}

function stripGeofences({ geofences: _g, ...store }: StoreDetailView) {
  return store;
}
