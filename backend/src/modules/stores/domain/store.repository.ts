import type { PageRequest } from '../../../shared/application/page';
import type {
  GeofenceChanges,
  GeofenceData,
  GeofenceView,
  StoreChanges,
  StoreData,
  StoreDetailView,
  StoreFilter,
  StoreView,
} from './store.types';

/** Todas las operaciones exigen companyId (aislamiento entre empresas). */
export abstract class StoreRepository {
  abstract list(
    companyId: string,
    filter: StoreFilter,
    page: PageRequest,
  ): Promise<{ items: StoreView[]; total: number }>;
  abstract findById(
    companyId: string,
    id: string,
  ): Promise<StoreDetailView | null>;
  abstract findIdByCode(
    companyId: string,
    code: string,
  ): Promise<string | null>;

  /** Crea el establecimiento y su geocerca inicial en una sola transacción. */
  abstract create(
    companyId: string,
    data: StoreData,
    initialGeofence: GeofenceData,
  ): Promise<StoreDetailView>;
  abstract update(
    companyId: string,
    id: string,
    changes: StoreChanges,
  ): Promise<StoreDetailView>;

  abstract findGeofence(
    companyId: string,
    storeId: string,
    id: string,
  ): Promise<GeofenceView | null>;
  abstract createGeofence(
    companyId: string,
    storeId: string,
    data: GeofenceData,
  ): Promise<GeofenceView>;
  abstract updateGeofence(
    companyId: string,
    id: string,
    changes: GeofenceChanges,
  ): Promise<GeofenceView>;
  abstract deleteGeofence(companyId: string, id: string): Promise<void>;
  abstract countGeofenceEvents(companyId: string, id: string): Promise<number>;
}
