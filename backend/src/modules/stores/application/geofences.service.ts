import { Injectable } from '@nestjs/common';
import { Actor, AuditLog } from '../../../shared/application/audit-log';
import { assertGeofenceNearStore } from '../domain/geofence.rules';
import {
  GeofenceInUseError,
  GeofenceNotFoundError,
  IncompleteCoordinatesError,
  LastActiveGeofenceError,
} from '../domain/store.errors';
import { StoreRepository } from '../domain/store.repository';
import type {
  GeofenceChanges,
  GeofenceView,
  StoreDetailView,
} from '../domain/store.types';
import { DEFAULT_MAX_ACCURACY_METERS, StoresService } from './stores.service';

export interface GeofenceInput {
  name: string;
  /** Si se omiten, se usa la ubicación del establecimiento. */
  centerLatitude?: number;
  centerLongitude?: number;
  radiusMeters: number;
  maxAccuracyMeters?: number;
}

@Injectable()
export class GeofencesService {
  constructor(
    private readonly stores: StoreRepository,
    private readonly storesService: StoresService,
    private readonly audit: AuditLog,
  ) {}

  async list(companyId: string, storeId: string): Promise<GeofenceView[]> {
    return (await this.storesService.get(companyId, storeId)).geofences;
  }

  async create(actor: Actor, storeId: string, input: GeofenceInput) {
    const store = await this.storesService.get(actor.companyId, storeId);
    const center = resolveCenter(
      input.centerLatitude,
      input.centerLongitude,
    ) ?? {
      latitude: store.latitude,
      longitude: store.longitude,
    };
    assertGeofenceNearStore(store, center);

    const geofence = await this.stores.createGeofence(
      actor.companyId,
      storeId,
      {
        name: input.name,
        centerLatitude: center.latitude,
        centerLongitude: center.longitude,
        radiusMeters: input.radiusMeters,
        maxAccuracyMeters:
          input.maxAccuracyMeters ?? DEFAULT_MAX_ACCURACY_METERS,
      },
    );
    await this.record(
      actor,
      geofence.id,
      'geofence.created',
      undefined,
      geofence,
    );
    return geofence;
  }

  async update(
    actor: Actor,
    storeId: string,
    id: string,
    input: Partial<
      Omit<GeofenceInput, 'centerLatitude' | 'centerLongitude'>
    > & {
      centerLatitude?: number;
      centerLongitude?: number;
      isActive?: boolean;
    },
  ) {
    const { store, geofence: before } = await this.load(
      actor.companyId,
      storeId,
      id,
    );

    const center = resolveCenter(input.centerLatitude, input.centerLongitude);
    if (center) assertGeofenceNearStore(store, center);
    if (input.isActive === false && before.isActive) {
      this.assertNotLastActive(store, id);
    }

    const changes: GeofenceChanges = {
      name: input.name,
      radiusMeters: input.radiusMeters,
      maxAccuracyMeters: input.maxAccuracyMeters,
      isActive: input.isActive,
      centerLatitude: center?.latitude,
      centerLongitude: center?.longitude,
    };
    const after = await this.stores.updateGeofence(
      actor.companyId,
      id,
      changes,
    );
    await this.record(actor, id, 'geofence.updated', before, after);
    return after;
  }

  async delete(actor: Actor, storeId: string, id: string) {
    const { store, geofence } = await this.load(actor.companyId, storeId, id);
    if (geofence.isActive) this.assertNotLastActive(store, id);
    // Las marcaciones guardan qué geocerca se usó: esa evidencia no se puede perder.
    if ((await this.stores.countGeofenceEvents(actor.companyId, id)) > 0) {
      throw new GeofenceInUseError();
    }
    await this.stores.deleteGeofence(actor.companyId, id);
    await this.record(actor, id, 'geofence.deleted', geofence, undefined);
  }

  private async load(companyId: string, storeId: string, id: string) {
    const store = await this.storesService.get(companyId, storeId);
    const geofence = store.geofences.find((g) => g.id === id);
    if (!geofence) throw new GeofenceNotFoundError();
    return { store, geofence };
  }

  /** Un establecimiento activo siempre debe tener al menos una geocerca activa. */
  private assertNotLastActive(store: StoreDetailView, geofenceId: string) {
    const othersActive = store.geofences.some(
      (g) => g.isActive && g.id !== geofenceId,
    );
    if (store.isActive && !othersActive) throw new LastActiveGeofenceError();
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
      entityType: 'Geofence',
      entityId: id,
      before,
      after,
    });
  }
}

function resolveCenter(latitude?: number, longitude?: number) {
  if (latitude === undefined && longitude === undefined) return null;
  if (latitude === undefined || longitude === undefined) {
    throw new IncompleteCoordinatesError();
  }
  return { latitude, longitude };
}
