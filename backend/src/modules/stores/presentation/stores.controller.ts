import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Actor } from '../../../shared/application/audit-log';
import { CurrentActor } from '../../../shared/auth/current-actor.decorator';
import { CurrentCompanyId } from '../../../shared/auth/current-company.decorator';
import { RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { ApiErrors } from '../../../shared/presentation/api-errors.decorator';
import { ApiPaginatedResponse } from '../../../shared/presentation/api-paginated-response.decorator';
import { BEARER_AUTH } from '../../../shared/presentation/swagger';
import { GeofencesService } from '../application/geofences.service';
import { LocationVerifier } from '../application/location-verifier';
import { StoresService } from '../application/stores.service';
import {
  CreateGeofenceDto,
  CreateStoreDto,
  GeofenceResponseDto,
  ListStoresQueryDto,
  LocationCheckDto,
  LocationCheckResponseDto,
  StoreDetailResponseDto,
  StoreResponseDto,
  UpdateGeofenceDto,
  UpdateStoreDto,
} from './dto/store.dto';

@ApiTags('Establecimientos y geocercas')
@ApiBearerAuth(BEARER_AUTH)
@ApiErrors(401, 403)
@Controller('stores')
export class StoresController {
  constructor(
    private readonly stores: StoresService,
    private readonly geofences: GeofencesService,
    private readonly locations: LocationVerifier,
  ) {}

  // ---------------- Establecimientos ----------------

  @Get()
  @RequirePermissions('stores.read')
  @ApiOperation({ summary: 'Listar establecimientos' })
  @ApiPaginatedResponse(StoreResponseDto)
  @ApiErrors(400)
  list(
    @CurrentCompanyId() companyId: string,
    @Query() query: ListStoresQueryDto,
  ) {
    return this.stores.list(
      companyId,
      { search: query.search, city: query.city, isActive: query.isActive },
      query.toPageRequest(),
    );
  }

  @Get(':id')
  @RequirePermissions('stores.read')
  @ApiOperation({ summary: 'Detalle de un establecimiento con sus geocercas' })
  @ApiOkResponse({ type: StoreDetailResponseDto })
  @ApiErrors(400, { 404: 'STORE_NOT_FOUND' })
  get(
    @CurrentCompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.stores.get(companyId, id);
  }

  @Post()
  @RequirePermissions('stores.manage')
  @ApiOperation({
    summary: 'Crear un establecimiento',
    description:
      'Crea también una geocerca circular centrada en el establecimiento ' +
      '(radio `geofenceRadiusMeters`, 100 m por defecto).',
  })
  @ApiCreatedResponse({ type: StoreDetailResponseDto })
  @ApiErrors(
    { 400: 'VALIDATION_ERROR | INVALID_TIMEZONE' },
    { 409: 'STORE_CODE_TAKEN' },
  )
  create(@CurrentActor() actor: Actor, @Body() dto: CreateStoreDto) {
    const { geofenceRadiusMeters, ...data } = dto;
    return this.stores.create(
      actor,
      {
        code: data.code,
        name: data.name,
        address: data.address ?? null,
        city: data.city ?? null,
        latitude: data.latitude,
        longitude: data.longitude,
        timezone: data.timezone ?? null,
      },
      geofenceRadiusMeters,
    );
  }

  @Patch(':id')
  @RequirePermissions('stores.manage')
  @ApiOperation({ summary: 'Editar, activar o desactivar un establecimiento' })
  @ApiOkResponse({ type: StoreDetailResponseDto })
  @ApiErrors(
    { 400: 'VALIDATION_ERROR | INVALID_TIMEZONE' },
    { 404: 'STORE_NOT_FOUND', 409: 'STORE_CODE_TAKEN' },
  )
  update(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStoreDto,
  ) {
    return this.stores.update(actor, id, dto);
  }

  @Post(':id/location-check')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('stores.manage')
  @ApiOperation({
    summary: 'Probar una ubicación contra las geocercas',
    description:
      'Úselo desde el celular en el establecimiento para calibrar el radio. ' +
      'No registra nada: aplica exactamente la misma regla que usará la marcación.',
  })
  @ApiOkResponse({ type: LocationCheckResponseDto })
  @ApiErrors(400, { 404: 'STORE_NOT_FOUND' })
  checkLocation(
    @CurrentCompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LocationCheckDto,
  ) {
    return this.locations.verify(companyId, id, dto);
  }

  // ---------------- Geocercas ----------------

  @Get(':id/geofences')
  @RequirePermissions('stores.read')
  @ApiOperation({ summary: 'Geocercas de un establecimiento' })
  @ApiOkResponse({ type: [GeofenceResponseDto] })
  @ApiErrors(400, { 404: 'STORE_NOT_FOUND' })
  listGeofences(
    @CurrentCompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.geofences.list(companyId, id);
  }

  @Post(':id/geofences')
  @RequirePermissions('stores.manage')
  @ApiOperation({ summary: 'Agregar una geocerca' })
  @ApiCreatedResponse({ type: GeofenceResponseDto })
  @ApiErrors(
    { 400: 'VALIDATION_ERROR | INCOMPLETE_COORDINATES | GEOFENCE_TOO_FAR' },
    { 404: 'STORE_NOT_FOUND' },
  )
  createGeofence(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateGeofenceDto,
  ) {
    return this.geofences.create(actor, id, dto);
  }

  @Patch(':id/geofences/:geofenceId')
  @RequirePermissions('stores.manage')
  @ApiOperation({ summary: 'Editar, activar o desactivar una geocerca' })
  @ApiOkResponse({ type: GeofenceResponseDto })
  @ApiErrors(
    { 400: 'VALIDATION_ERROR | INCOMPLETE_COORDINATES | GEOFENCE_TOO_FAR' },
    {
      404: 'STORE_NOT_FOUND | GEOFENCE_NOT_FOUND',
      409: 'LAST_ACTIVE_GEOFENCE',
    },
  )
  updateGeofence(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('geofenceId', ParseUUIDPipe) geofenceId: string,
    @Body() dto: UpdateGeofenceDto,
  ) {
    return this.geofences.update(actor, id, geofenceId, dto);
  }

  @Delete(':id/geofences/:geofenceId')
  @RequirePermissions('stores.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar una geocerca sin marcaciones' })
  @ApiNoContentResponse({ description: 'Geocerca eliminada' })
  @ApiErrors(400, {
    404: 'STORE_NOT_FOUND | GEOFENCE_NOT_FOUND',
    409: 'LAST_ACTIVE_GEOFENCE | GEOFENCE_IN_USE',
  })
  deleteGeofence(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('geofenceId', ParseUUIDPipe) geofenceId: string,
  ) {
    return this.geofences.delete(actor, id, geofenceId);
  }
}
