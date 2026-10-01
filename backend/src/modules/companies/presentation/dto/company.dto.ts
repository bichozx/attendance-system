import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../../shared/presentation/pagination-query.dto';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;
const IfPresent = () => ValidateIf((_, v) => v !== undefined);

export class ShiftDefaultsDto {
  /** Minutos antes del inicio desde los que se puede marcar. @example 5 */
  @IfPresent()
  @IsInt()
  @Min(0)
  @Max(120)
  earlyClockInMinutes?: number;

  /** Minutos de gracia antes de contar tardanza. @example 5 */
  @IfPresent()
  @IsInt()
  @Min(0)
  @Max(60)
  lateToleranceMinutes?: number;

  /** Descanso por defecto. @example 60 */
  @IfPresent()
  @IsInt()
  @Min(0)
  @Max(240)
  breakMinutes?: number;
}

/** Lo que el admin de la empresa puede cambiar. */
export class UpdateCompanySettingsDto {
  /** @example "Panadería Doña Rosa" */
  @IfPresent()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(160)
  legalName?: string | null;

  /** Solo cambia cómo se muestran las horas; los turnos guardados no se mueven. @example "America/Bogota" */
  @IfPresent()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  /** Se aplican a los turnos NUEVOS que no indiquen otros valores. */
  @IfPresent()
  @ValidateNested()
  @Type(() => ShiftDefaultsDto)
  shiftDefaults?: ShiftDefaultsDto;
}

/** Lo que además puede cambiar el superadmin. */
export class UpdatePlatformCompanyDto extends UpdateCompanySettingsDto {
  /** NIT. null para borrarlo. @example "900123456-7" */
  @IsOptional()
  @Transform(trim)
  @Matches(/^[0-9A-Za-z.-]{3,30}$/, { message: 'taxId has an invalid format' })
  taxId?: string | null;

  /** Código ISO de 2 letras. @example "CO" */
  @IfPresent()
  @Transform(upper)
  @IsString()
  country?: string;

  /** Código ISO de 3 letras. @example "COP" */
  @IfPresent()
  @Transform(upper)
  @IsString()
  currency?: string;

  /** @example "panaderia-dona-rosa" */
  @IfPresent()
  @Transform(trim)
  @IsString()
  @MaxLength(50)
  slug?: string;
}

export class FirstAdminDto {
  /** Recibirá el correo de bienvenida para crear su contraseña. @example "rosa@panaderiarosa.com" */
  @Transform(trim)
  @IsEmail()
  @MaxLength(254)
  email: string;

  /** @example "Rosa" */
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName: string;

  /** @example "Martínez" */
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName: string;
}

export class CreateCompanyDto {
  /** @example "Panadería Doña Rosa" */
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  /** @example "Panadería Doña Rosa S.A.S." */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(160)
  legalName?: string;

  /** @example "900123456-7" */
  @IsOptional()
  @Transform(trim)
  @Matches(/^[0-9A-Za-z.-]{3,30}$/, { message: 'taxId has an invalid format' })
  taxId?: string;

  /** Si se omite, se genera desde el nombre. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(50)
  slug?: string;

  /** Por defecto CO. */
  @IsOptional()
  @Transform(upper)
  @IsString()
  country?: string;

  /** Por defecto America/Bogota. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  /** Por defecto COP. */
  @IsOptional()
  @Transform(upper)
  @IsString()
  currency?: string;

  /** Por defecto TRIAL (periodo de prueba). */
  @IsOptional()
  @IsIn(['TRIAL', 'ACTIVE'])
  status?: 'TRIAL' | 'ACTIVE';

  @ValidateNested()
  @Type(() => FirstAdminDto)
  admin: FirstAdminDto;
}

export class ChangeCompanyStatusDto {
  /** SUSPENDED y CANCELLED bloquean el acceso de inmediato (sin borrar datos). */
  @IsIn(['TRIAL', 'ACTIVE', 'SUSPENDED', 'CANCELLED'])
  status: 'TRIAL' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED';

  /** @example "Factura de octubre vencida" */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class ListCompaniesQueryDto extends PaginationQueryDto {
  /** Nombre, razón social, slug o NIT. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsIn(['TRIAL', 'ACTIVE', 'SUSPENDED', 'CANCELLED'])
  status?: 'TRIAL' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED';
}

// ---------- Respuestas ----------

export class ShiftDefaultsResponseDto {
  /** @example 5 */
  earlyClockInMinutes: number;
  /** @example 0 */
  lateToleranceMinutes: number;
  /** @example 0 */
  breakMinutes: number;
}

export class CompanyResponseDto {
  id: string;
  /** @example "Empresa Demo" */
  name: string;
  legalName: string | null;
  taxId: string | null;
  /** @example "demo" */
  slug: string;
  /** @example "CO" */
  country: string;
  /** @example "America/Bogota" */
  timezone: string;
  /** @example "COP" */
  currency: string;
  /** @example "ACTIVE" */
  status: string;
  shiftDefaults: ShiftDefaultsResponseDto;
  createdAt: Date;
  updatedAt: Date;
}

export class CompanyStatsDto {
  activeEmployees: number;
  activeUsers: number;
  stores: number;
}

export class CompanyAdminDto {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  /** false = aún no creó su contraseña (reenvíe la invitación si venció). */
  hasLoggedIn: boolean;
}

export class PlatformCompanyResponseDto extends CompanyResponseDto {
  stats: CompanyStatsDto;
}

export class PlatformCompanyDetailDto extends PlatformCompanyResponseDto {
  admins: CompanyAdminDto[];
}
