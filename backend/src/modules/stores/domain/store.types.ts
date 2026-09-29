export interface GeofenceView {
  id: string;
  storeId: string;
  name: string;
  centerLatitude: number;
  centerLongitude: number;
  radiusMeters: number;
  /** Se rechazan marcaciones con precisión GPS peor que este valor. */
  maxAccuracyMeters: number;
  isActive: boolean;
}

export interface StoreView {
  id: string;
  code: string;
  name: string;
  address: string | null;
  city: string | null;
  latitude: number;
  longitude: number;
  /** null = usa la zona horaria de la empresa. */
  timezone: string | null;
  isActive: boolean;
  activeGeofences: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface StoreDetailView extends StoreView {
  geofences: GeofenceView[];
}

export interface StoreFilter {
  search?: string;
  city?: string;
  isActive?: boolean;
}

export interface StoreData {
  code: string;
  name: string;
  address: string | null;
  city: string | null;
  latitude: number;
  longitude: number;
  timezone: string | null;
}

export type StoreChanges = Partial<StoreData> & { isActive?: boolean };

export interface GeofenceData {
  name: string;
  centerLatitude: number;
  centerLongitude: number;
  radiusMeters: number;
  maxAccuracyMeters: number;
}

export type GeofenceChanges = Partial<GeofenceData> & { isActive?: boolean };
