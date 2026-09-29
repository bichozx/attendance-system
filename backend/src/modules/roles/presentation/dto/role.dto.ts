import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateRoleDto {
  /**
   * Mayúsculas, números y guion bajo. Se convierte a mayúsculas.
   * @example "CAJERO_LIDER"
   */
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Matches(/^[A-Z][A-Z0-9_]{1,39}$/, {
    message: 'code must be 2-40 chars: letters, numbers and underscore',
  })
  code: string;

  /** @example "Cajero líder" */
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name: string;

  /** @example "Cajero que además aprueba cambios de turno" */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(255)
  description?: string | null;

  /**
   * Códigos de permiso (ver GET /permissions).
   * @example ["attendance.clock", "shift_changes.approve"]
   */
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  permissions: string[];
}

/** El código no se puede cambiar: otros sistemas pueden depender de él. */
export class UpdateRoleDto {
  /** @example "Cajero líder" */
  @ValidateIf((_, v) => v !== undefined)
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  /** null para borrarla. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(255)
  description?: string | null;

  /** Reemplaza la lista completa de permisos. */
  @ValidateIf((_, v) => v !== undefined)
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  permissions?: string[];
}

export class RoleResponseDto {
  id: string;
  /** @example "SUPERVISOR" */
  code: string;
  /** @example "Supervisor" */
  name: string;
  description: string | null;
  /** true = rol del sistema, de solo lectura. */
  isSystem: boolean;
  /** @example ["shifts.manage", "attendance.read"] */
  permissions: string[];
}

export class PermissionResponseDto {
  /** @example "attendance.clock" */
  code: string;
  /** @example "attendance" */
  module: string;
  description: string | null;
}
