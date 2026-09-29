import { distanceMeters } from '../../../shared/domain/geo';
import { assertGeofenceNearStore, evaluateLocation } from './geofence.rules';
import { GeofenceTooFarError } from './store.errors';
import type { GeofenceView } from './store.types';

const STORE = { latitude: 4.6097, longitude: -74.0817 };

/** Desplaza un punto `meters` hacia el norte (1° de latitud ≈ 111.195 m). */
const north = (meters: number) => ({
  latitude: STORE.latitude + meters / 111_195,
  longitude: STORE.longitude,
});

const fence = (over: Partial<GeofenceView> = {}): GeofenceView => ({
  id: 'g-1',
  storeId: 's-1',
  name: 'Perímetro',
  centerLatitude: STORE.latitude,
  centerLongitude: STORE.longitude,
  radiusMeters: 100,
  maxAccuracyMeters: 50,
  isActive: true,
  ...over,
});

describe('distanceMeters', () => {
  it('es 0 para el mismo punto', () => {
    expect(distanceMeters(STORE, STORE)).toBe(0);
  });

  it('mide ~100 m hacia el norte con error menor a 1 m', () => {
    expect(distanceMeters(STORE, north(100))).toBeCloseTo(100, 0);
  });

  it('1° de longitud en el ecuador mide ~111,2 km', () => {
    const km =
      distanceMeters(
        { latitude: 0, longitude: 0 },
        { latitude: 0, longitude: 1 },
      ) / 1000;
    expect(km).toBeCloseTo(111.2, 1);
  });
});

describe('evaluateLocation', () => {
  it('acepta un punto dentro del radio con buena precisión', () => {
    const result = evaluateLocation({ ...north(60), accuracyMeters: 10 }, [
      fence(),
    ]);
    expect(result).toMatchObject({
      accepted: true,
      rejection: null,
      geofenceId: 'g-1',
    });
    expect(result.distanceMeters).toBeCloseTo(60, 0);
  });

  it('acepta justo en el borde', () => {
    expect(
      evaluateLocation({ ...north(99.9), accuracyMeters: 5 }, [fence()])
        .accepted,
    ).toBe(true);
  });

  it('rechaza fuera del radio', () => {
    const result = evaluateLocation({ ...north(150), accuracyMeters: 10 }, [
      fence(),
    ]);
    expect(result).toMatchObject({
      accepted: false,
      rejection: 'OUTSIDE_GEOFENCE',
    });
  });

  it('rechaza por precisión antes que por distancia', () => {
    // Dentro del radio, pero el GPS no es confiable
    const result = evaluateLocation({ ...north(10), accuracyMeters: 80 }, [
      fence(),
    ]);
    expect(result.rejection).toBe('LOW_GPS_ACCURACY');
  });

  it('ignora geocercas inactivas', () => {
    const result = evaluateLocation({ ...STORE, accuracyMeters: 5 }, [
      fence({ isActive: false }),
    ]);
    expect(result.rejection).toBe('NO_ACTIVE_GEOFENCE');
  });

  it('con varias geocercas, usa la que contiene el punto', () => {
    const parking = fence({
      id: 'g-parqueadero',
      centerLatitude: north(300).latitude,
      radiusMeters: 50,
    });
    const result = evaluateLocation({ ...north(320), accuracyMeters: 10 }, [
      fence(),
      parking,
    ]);
    expect(result).toMatchObject({
      accepted: true,
      geofenceId: 'g-parqueadero',
    });
  });
});

describe('assertGeofenceNearStore', () => {
  it('permite centros cercanos', () => {
    expect(() => assertGeofenceNearStore(STORE, north(500))).not.toThrow();
  });

  it('detecta latitud y longitud invertidas', () => {
    const swapped = { latitude: STORE.longitude, longitude: STORE.latitude };
    expect(() => assertGeofenceNearStore(STORE, swapped)).toThrow(
      GeofenceTooFarError,
    );
  });
});
