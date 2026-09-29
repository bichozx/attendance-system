import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from '../../../../shared/presentation/pagination-query.dto';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;
const IfPresent = () => ValidateIf((_, v) => v !== undefined);

/** Límites de radio: menos de 20 m es más fino que el error normal de un GPS de teléfono. */
export const MIN_RADIUS = 20;
export const MAX_RADIUS = 2_000;

function Latitude() {
  return (target: object, key: string) => {
    IsNumber({ allowNaN: false, allowInfinity: false })(target, key);
    Min(-90)(target, key);
    Max(90)(target, key);
  };
}
function Longitude() {
  return (target: object, key: string) => {
    IsNumber({ allowNaN: false, allowInfinity: false })(target, key);
    Min(-180)(target, key);
    Max(180)(target, key);
  };
}

export class ListStoresQueryDto extends PaginationQueryDto {
  /** Busca en nombre, código y dirección. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  city?: string;

  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  isActive?: boolean;
}

export class CreateStoreDto {
  /** @example "NORTE" */
  @Transform(upper)
  @Matches(/^[A-Z0-9_-]{1,30}$/, {
    message: 'code must be 1-30 chars: letters, numbers, - or _',
  })
  code: string;

  /** @example "Tienda Norte" */
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  /** @example "Calle 100 # 15-20" */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  address?: string | null;

  /** @example "Bogotá" */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  city?: string | null;

  /** @example 4.6867 */
  @Latitude()
  latitude: number;

  /** @example -74.0468 */
  @Longitude()
  longitude: number;

  /**
   * Zona horaria IANA; si se omite, se usa la de la empresa.
   * @example "America/Bogota"
   */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string | null;

  /**
   * Radio de la geocerca que se crea automáticamente, centrada en el establecimiento.
   * @example 100
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(MIN_RADIUS)
  @Max(MAX_RADIUS)
  geofenceRadiusMeters?: number;
}

export class UpdateStoreDto {
  @IfPresent()
  @Transform(upper)
  @Matches(/^[A-Z0-9_-]{1,30}$/, {
    message: 'code must be 1-30 chars: letters, numbers, - or _',
  })
  code?: string;

  @IfPresent()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  address?: string | null;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  city?: string | null;

  /** Cambiar la ubicación NO mueve las geocercas: ajústelas por separado. */
  @IfPresent()
  @Latitude()
  latitude?: number;

  @IfPresent()
  @Longitude()
  longitude?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string | null;

  /** false = no se podrán programar turnos nuevos en este establecimiento. */
  @IfPresent()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateGeofenceDto {
  /** @example "Parqueadero" */
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name: string;

  /** Si se omite junto con la longitud, se usa la ubicación del establecimiento. */
  @IfPresent()
  @Latitude()
  centerLatitude?: number;

  @IfPresent()
  @Longitude()
  centerLongitude?: number;

  /** @example 80 */
  @IsInt()
  @Min(MIN_RADIUS)
  @Max(MAX_RADIUS)
  radiusMeters: number;

  /**
   * Precisión GPS mínima exigida. Por defecto 50 m.
   * @example 50
   */
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(500)
  maxAccuracyMeters?: number;
}

export class UpdateGeofenceDto {
  @IfPresent()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  /** Envíe latitud y longitud juntas. */
  @IfPresent()
  @Latitude()
  centerLatitude?: number;

  @IfPresent()
  @Longitude()
  centerLongitude?: number;

  @IfPresent()
  @IsInt()
  @Min(MIN_RADIUS)
  @Max(MAX_RADIUS)
  radiusMeters?: number;

  @IfPresent()
  @IsInt()
  @Min(5)
  @Max(500)
  maxAccuracyMeters?: number;

  @IfPresent()
  @IsBoolean()
  isActive?: boolean;
}

export class LocationCheckDto {
  /** @example 4.6868 */
  @Latitude()
  latitude: number;

  /** @example -74.0469 */
  @Longitude()
  longitude: number;

  /**
   * Precisión reportada por el GPS del teléfono, en metros.
   * @example 12
   */
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(100_000)
  accuracyMeters: number;
}

// ---------- Respuestas ----------

export class GeofenceResponseDto {
  id: string;
  storeId: string;
  /** @example "Perímetro Tienda Norte" */
  name: string;
  /** @example 4.6867 */
  centerLatitude: number;
  /** @example -74.0468 */
  centerLongitude: number;
  /** @example 100 */
  radiusMeters: number;
  /** @example 50 */
  maxAccuracyMeters: number;
  isActive: boolean;
}

export class StoreResponseDto {
  id: string;
  /** @example "NORTE" */
  code: string;
  /** @example "Tienda Norte" */
  name: string;
  address: string | null;
  city: string | null;
  /** @example 4.6867 */
  latitude: number;
  /** @example -74.0468 */
  longitude: number;
  timezone: string | null;
  isActive: boolean;
  /** Si es 0, nadie puede marcar asistencia aquí. */
  activeGeofences: number;
  createdAt: Date;
  updatedAt: Date;
}

export class StoreDetailResponseDto extends StoreResponseDto {
  geofences: GeofenceResponseDto[];
}

export class LocationCheckResponseDto {
  accepted: boolean;
  /**
   * NO_ACTIVE_GEOFENCE | LOW_GPS_ACCURACY | OUTSIDE_GEOFENCE, o null si se acepta.
   * @example "OUTSIDE_GEOFENCE"
   */
  rejection: string | null;
  geofenceId: string | null;
  /** @example 137.4 */
  distanceMeters: number | null;
  /** @example 100 */
  radiusMeters: number | null;
  /** @example 12 */
  accuracyMeters: number;
}
