import { distanceMeters, GeoPoint } from '../../../shared/domain/geo';
import { GeofenceTooFarError } from './store.errors';
import type { GeofenceView } from './store.types';

/** Distancia máxima permitida entre el establecimiento y el centro de una geocerca. */
export const MAX_GEOFENCE_OFFSET_METERS = 2_000;

export function assertGeofenceNearStore(
  store: GeoPoint,
  center: GeoPoint,
): void {
  const distance = distanceMeters(store, center);
  if (distance > MAX_GEOFENCE_OFFSET_METERS) {
    throw new GeofenceTooFarError(distance, MAX_GEOFENCE_OFFSET_METERS);
  }
}

// ---------------------------------------------------------------------
// Verificación de ubicación (la usará el módulo de asistencia al marcar)
// ---------------------------------------------------------------------

export interface LocationFix extends GeoPoint {
  /** Radio de incertidumbre que reporta el GPS del teléfono, en metros. */
  accuracyMeters: number;
}

export type LocationRejection =
  'NO_ACTIVE_GEOFENCE' | 'LOW_GPS_ACCURACY' | 'OUTSIDE_GEOFENCE';

export interface LocationCheckResult {
  accepted: boolean;
  rejection: LocationRejection | null;
  /** Geocerca evaluada (la más cercana a contener el punto). */
  geofenceId: string | null;
  /** Distancia al centro de esa geocerca. */
  distanceMeters: number | null;
  radiusMeters: number | null;
  accuracyMeters: number;
}

/**
 * Decide si una ubicación está dentro de alguna geocerca activa.
 *
 * Reglas:
 * 1. Se evalúa la geocerca "más favorable": la que tiene menor (distancia − radio).
 * 2. Si la precisión del GPS es peor que el máximo de esa geocerca → LOW_GPS_ACCURACY.
 *    Se revisa primero porque con mala precisión la distancia no es confiable.
 * 3. Dentro = distancia al centro ≤ radio.
 */
export function evaluateLocation(
  fix: LocationFix,
  geofences: GeofenceView[],
): LocationCheckResult {
  const active = geofences.filter((g) => g.isActive);
  if (active.length === 0) {
    return reject('NO_ACTIVE_GEOFENCE', fix, null, null);
  }

  const [best] = active
    .map((geofence) => ({
      geofence,
      distance: distanceMeters(fix, {
        latitude: geofence.centerLatitude,
        longitude: geofence.centerLongitude,
      }),
    }))
    .sort(
      (a, b) =>
        a.distance -
        a.geofence.radiusMeters -
        (b.distance - b.geofence.radiusMeters),
    );

  const distance = Math.round(best.distance * 10) / 10;

  if (fix.accuracyMeters > best.geofence.maxAccuracyMeters) {
    return reject('LOW_GPS_ACCURACY', fix, best.geofence, distance);
  }
  if (best.distance > best.geofence.radiusMeters) {
    return reject('OUTSIDE_GEOFENCE', fix, best.geofence, distance);
  }
  return {
    accepted: true,
    rejection: null,
    geofenceId: best.geofence.id,
    distanceMeters: distance,
    radiusMeters: best.geofence.radiusMeters,
    accuracyMeters: fix.accuracyMeters,
  };
}

function reject(
  rejection: LocationRejection,
  fix: LocationFix,
  geofence: GeofenceView | null,
  distance: number | null,
): LocationCheckResult {
  return {
    accepted: false,
    rejection,
    geofenceId: geofence?.id ?? null,
    distanceMeters: distance,
    radiusMeters: geofence?.radiusMeters ?? null,
    accuracyMeters: fix.accuracyMeters,
  };
}
