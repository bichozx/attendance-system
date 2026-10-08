import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../../shared/presentation/pagination-query.dto';
import { IsStrongPassword } from '../../../../shared/presentation/validators/password.decorator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const MEMBERSHIP_STATUSES = ['INVITED', 'ACTIVE', 'DISABLED'] as const;

export class ListUsersQueryDto extends PaginationQueryDto {
  /** Busca en correo, nombre y apellido. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsIn(MEMBERSHIP_STATUSES)
  status?: (typeof MEMBERSHIP_STATUSES)[number];

  @IsOptional()
  @IsUUID()
  roleId?: string;
}

export class CreateUserDto {
  /** @example "supervisor@demo.local" */
  @Transform(trim)
  @IsEmail()
  @MaxLength(254)
  email: string;

  /** @example "Laura" */
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName: string;

  /** @example "Gómez" */
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName: string;

  /** @example "+57 300 123 4567" */
  @IsOptional()
  @Transform(trim)
  @Matches(/^\+?[0-9 ]{7,20}$/, {
    message: 'phone must be a valid phone number',
  })
  phone?: string;

  /**
   * Contraseña temporal (opcional). Si se omite, se envía una invitación por correo.
   * Se ignora si el correo ya tiene cuenta (la persona entra con su contraseña de siempre).
   */
  @IsOptional()
  @IsStrongPassword()
  password?: string;

  @IsUUID()
  roleId: string;
}

export class ChangeUserRoleDto {
  @IsUUID()
  roleId: string;
}

export class ChangeUserStatusDto {
  /** DISABLED cierra de inmediato sus sesiones en esta empresa. */
  @IsIn(['ACTIVE', 'DISABLED'])
  status: 'ACTIVE' | 'DISABLED';
}

export class UserRoleDto {
  id: string;
  /** @example "SUPERVISOR" */
  code: string;
  /** @example "Supervisor" */
  name: string;
}

export class CompanyUserResponseDto {
  id: string;
  /** @example "supervisor@demo.local" */
  email: string;
  /** @example "Laura" */
  firstName: string;
  /** @example "Gómez" */
  lastName: string;
  phone: string | null;
  /** @example "ACTIVE" */
  accountStatus: string;
  /** @example "ACTIVE" */
  membershipStatus: string;
  role: UserRoleDto;
  employeeId: string | null;
  lastLoginAt: Date | null;
  memberSince: Date;
  /** true = aún no ha creado su contraseña con el enlace de invitación. */
  invitationPending: boolean;
}

export class CreateUserResponseDto {
  user: CompanyUserResponseDto;
  /** true = el correo ya tenía cuenta; entra con su contraseña actual. */
  existingAccount: boolean;
  /** true = se le envió una invitación por correo para crear su contraseña. */
  invited: boolean;
}
