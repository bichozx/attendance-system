import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../../shared/presentation/pagination-query.dto';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class InboxQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  unreadOnly?: boolean;
}

export class RegisterDeviceDto {
  /** Token de push del dispositivo (Expo). @example "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]" */
  @IsString()
  @MinLength(10)
  @MaxLength(255)
  token: string;

  @IsIn(['IOS', 'ANDROID', 'WEB'])
  platform: 'IOS' | 'ANDROID' | 'WEB';
}

export class UnregisterDeviceDto {
  @IsString()
  @MaxLength(255)
  token: string;
}

export class AnnouncementDto {
  /** @example "Inventario el sábado" */
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(80)
  title: string;

  /** @example "El sábado abrimos a las 10:00 por inventario. Llega 30 minutos antes." */
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  body: string;

  /** Solo empleados cuya sede principal sea una de estas. Sin filtros: toda la empresa. */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  storeIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  employeeIds?: string[];
}

export class InboxItemDto {
  id: string;
  /** @example "SHIFT_REMINDER" */
  type: string;
  /** @example "Tu turno empieza pronto" */
  title: string;
  /** @example "A las 14:00 en Tienda Centro. Ya puedes marcar tu entrada." */
  body: string;
  /** Ej: { shiftId } para abrir la pantalla correspondiente. */
  data: Record<string, unknown> | null;
  readAt: Date | null;
  createdAt: Date;
}

export class UnreadCountDto {
  /** @example 3 */
  unread: number;
}

export class AnnouncementResultDto {
  /** @example 42 */
  recipients: number;
}
