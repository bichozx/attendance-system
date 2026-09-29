import { Injectable } from '@nestjs/common';
import {
  evaluateLocation,
  LocationCheckResult,
  LocationFix,
} from '../domain/geofence.rules';
import { StoresService } from './stores.service';

/**
 * Punto de entrada para verificar una ubicación contra las geocercas de un establecimiento.
 * Se exporta desde StoresModule: el módulo de asistencia lo usará al marcar.
 */
@Injectable()
export class LocationVerifier {
  constructor(private readonly stores: StoresService) {}

  async verify(
    companyId: string,
    storeId: string,
    fix: LocationFix,
  ): Promise<LocationCheckResult> {
    const store = await this.stores.get(companyId, storeId);
    return evaluateLocation(fix, store.geofences);
  }
}
