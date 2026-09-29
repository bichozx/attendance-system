import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from '../../../../shared/presentation/pagination-query.dto';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

/** Permite omitir el campo, pero no enviarlo como null. */
const IfPresent = () => ValidateIf((_, v) => v !== undefined);

const DOCUMENT_TYPES = ['CC', 'CE', 'TI', 'PPT', 'PASSPORT', 'OTHER'] as const;
const EMPLOYEE_STATUSES = [
  'ACTIVE',
  'ON_LEAVE',
  'INACTIVE',
  'TERMINATED',
] as const;
const DATE = { strict: true, strictSeparator: true };
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MSG = { message: '$property must be a date in YYYY-MM-DD format' };

export class ListEmployeesQueryDto extends PaginationQueryDto {
  /** Busca en nombre, apellido, código, documento y correo. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsIn(EMPLOYEE_STATUSES)
  status?: (typeof EMPLOYEE_STATUSES)[number];

  @IsOptional()
  @IsUUID()
  positionId?: string;

  @IsOptional()
  @IsUUID()
  storeId?: string;
}

export class CreateEmployeeDto {
  /**
   * Código interno, único en la empresa. Se guarda en mayúsculas.
   * @example "EMP-002"
   */
  @Transform(upper)
  @Matches(/^[A-Z0-9_-]{1,30}$/, {
    message: 'code must be 1-30 chars: letters, numbers, - or _',
  })
  code: string;

  /** @example "CC" */
  @IsIn(DOCUMENT_TYPES)
  documentType: (typeof DOCUMENT_TYPES)[number];

  /** @example "1020304050" */
  @Transform(upper)
  @Matches(/^[A-Z0-9-]{3,20}$/, {
    message: 'documentNumber must be 3-20 chars: letters, numbers or -',
  })
  documentNumber: string;

  /** @example "María" */
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName: string;

  /** @example "Rodríguez" */
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName: string;

  /** @example "maria.rodriguez@correo.com" */
  @IsOptional()
  @Transform(trim)
  @IsEmail()
  @MaxLength(254)
  email?: string | null;

  /** @example "+57 310 555 1234" */
  @IsOptional()
  @Transform(trim)
  @Matches(/^\+?[0-9 ]{7,20}$/, {
    message: 'phone must be a valid phone number',
  })
  phone?: string | null;

  /** @example "1995-04-12" */
  @IsOptional()
  @Matches(DATE_ONLY, DATE_MSG)
  @IsISO8601(DATE)
  birthDate?: string | null;

  /** @example "2026-09-01" */
  @Matches(DATE_ONLY, DATE_MSG)
  @IsISO8601(DATE)
  hireDate: string;

  @IsOptional()
  @IsUUID()
  positionId?: string | null;

  @IsOptional()
  @IsUUID()
  defaultStoreId?: string | null;
}

/**
 * Todos los campos son opcionales. En email, phone, birthDate, positionId y
 * defaultStoreId, enviar null borra el valor.
 */
export class UpdateEmployeeDto {
  @IfPresent()
  @Transform(upper)
  @Matches(/^[A-Z0-9_-]{1,30}$/, {
    message: 'code must be 1-30 chars: letters, numbers, - or _',
  })
  code?: string;

  @IfPresent()
  @IsIn(DOCUMENT_TYPES)
  documentType?: (typeof DOCUMENT_TYPES)[number];

  @IfPresent()
  @Transform(upper)
  @Matches(/^[A-Z0-9-]{3,20}$/, {
    message: 'documentNumber must be 3-20 chars: letters, numbers or -',
  })
  documentNumber?: string;

  @IfPresent()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName?: string;

  @IfPresent()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName?: string;

  @IsOptional()
  @Transform(trim)
  @IsEmail()
  @MaxLength(254)
  email?: string | null;

  @IsOptional()
  @Transform(trim)
  @Matches(/^\+?[0-9 ]{7,20}$/, {
    message: 'phone must be a valid phone number',
  })
  phone?: string | null;

  @IsOptional()
  @Matches(DATE_ONLY, DATE_MSG)
  @IsISO8601(DATE)
  birthDate?: string | null;

  /** Corrige la fecha de ingreso. Para reintegros use PATCH /employees/:id/status. */
  @IfPresent()
  @Matches(DATE_ONLY, DATE_MSG)
  @IsISO8601(DATE)
  hireDate?: string;

  @IsOptional()
  @IsUUID()
  positionId?: string | null;

  @IsOptional()
  @IsUUID()
  defaultStoreId?: string | null;
}

export class ChangeEmployeeStatusDto {
  /**
   * INACTIVE y TERMINATED desactivan su acceso a la app y cierran sus sesiones.
   * @example "TERMINATED"
   */
  @IsIn(EMPLOYEE_STATUSES)
  status: (typeof EMPLOYEE_STATUSES)[number];

  /**
   * Obligatoria si status = TERMINATED.
   * @example "2026-10-15"
   */
  @IsOptional()
  @Matches(DATE_ONLY, DATE_MSG)
  @IsISO8601(DATE)
  terminationDate?: string;

  /** Obligatoria para reintegrar a alguien retirado (TERMINATED → ACTIVE). */
  @IsOptional()
  @Matches(DATE_ONLY, DATE_MSG)
  @IsISO8601(DATE)
  rehireDate?: string;
}

export class GrantAccessDto {
  /** Si se omite, se usa el correo registrado del empleado. */
  @IsOptional()
  @Transform(trim)
  @IsEmail()
  @MaxLength(254)
  email?: string;

  /**
   * Contraseña inicial; obligatoria si el correo no tiene cuenta.
   * @example "Temporal2026"
   */
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d)/, {
    message: 'password must contain at least one letter and one number',
  })
  password?: string;

  /** Si se omite, rol EMPLOYEE. */
  @IsOptional()
  @IsUUID()
  roleId?: string;
}

// ---------- Cargos ----------

export class ListPositionsQueryDto {
  /** Incluir cargos desactivados. */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includeInactive?: boolean;
}

export class CreatePositionDto {
  /** @example "Cajero" */
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(255)
  description?: string | null;
}

export class UpdatePositionDto {
  @IfPresent()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(255)
  description?: string | null;

  /** false oculta el cargo al crear empleados, sin afectar a los existentes. */
  @IfPresent()
  @IsBoolean()
  isActive?: boolean;
}

// ---------- Respuestas ----------

export class RefDto {
  id: string;
  /** @example "Cajero" */
  name: string;
}

export class EmployeeResponseDto {
  id: string;
  /** @example "EMP-001" */
  code: string;
  /** @example "CC" */
  documentType: string;
  /** @example "1000000001" */
  documentNumber: string;
  /** @example "Carlos" */
  firstName: string;
  /** @example "Pérez" */
  lastName: string;
  email: string | null;
  phone: string | null;
  /** @example "1995-04-12" */
  birthDate: string | null;
  /** @example "2026-01-15" */
  hireDate: string;
  terminationDate: string | null;
  /** @example "ACTIVE" */
  status: string;
  position: RefDto | null;
  defaultStore: RefDto | null;
  /** true si tiene cuenta para usar la app. */
  hasAppAccess: boolean;
  userId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class GrantAccessResponseDto {
  employee: EmployeeResponseDto;
  /** true = el correo ya tenía cuenta; entra con su contraseña actual. */
  existingAccount: boolean;
}

export class PositionResponseDto {
  id: string;
  /** @example "Cajero" */
  name: string;
  description: string | null;
  isActive: boolean;
}
