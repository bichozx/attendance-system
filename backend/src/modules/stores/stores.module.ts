import { Module } from '@nestjs/common';
import { GeofencesService } from './application/geofences.service';
import { LocationVerifier } from './application/location-verifier';
import { StoresService } from './application/stores.service';
import { StoreRepository } from './domain/store.repository';
import { PrismaStoreRepository } from './infrastructure/prisma-store.repository';
import { StoresController } from './presentation/stores.controller';

@Module({
  controllers: [StoresController],
  providers: [
    StoresService,
    GeofencesService,
    LocationVerifier,
    { provide: StoreRepository, useClass: PrismaStoreRepository },
  ],
  // Turnos y asistencia los usarán
  exports: [StoresService, LocationVerifier],
})
export class StoresModule {}
