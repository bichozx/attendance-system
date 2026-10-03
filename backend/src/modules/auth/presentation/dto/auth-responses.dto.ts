// Clases solo para documentar las respuestas en Swagger.
// El plugin de @nestjs/swagger lee los tipos y los comentarios automáticamente.

export class AuthTokensDto {
  accessToken: string;

  /**
   * Segundos hasta que expira el access token.
   * @example 900
   */
  accessTokenExpiresIn: number;

  /** Guárdalo de forma segura (SecureStore en móvil). Se invalida en cada refresh. */
  refreshToken: string;

  refreshTokenExpiresAt: Date;
}

export class UserProfileDto {
  id: string;
  /** @example "admin@demo.local" */
  email: string;
  /** @example "Ana" */
  firstName: string;
  /** @example "Administradora" */
  lastName: string;
  isPlatformAdmin: boolean;
  /** true = contraseña temporal: la app debe llevar a la pantalla de cambio. */
  mustChangePassword: boolean;
}

export class CompanyRoleDto {
  /** @example "COMPANY_ADMIN" */
  code: string;
  /** @example "Administrador" */
  name: string;
}

export class ActiveCompanyDto {
  id: string;
  /** @example "Empresa Demo" */
  name: string;
  /** @example "demo" */
  slug: string;
  role: CompanyRoleDto;
}

export class LoginResponseDto extends AuthTokensDto {
  user: UserProfileDto;
  /** null solo para el superadministrador sin empresa. */
  company: ActiveCompanyDto | null;
}

export class CurrentUserResponseDto {
  user: UserProfileDto;
  company: ActiveCompanyDto | null;
  /** @example ["employees.read", "shifts.manage"] */
  permissions: string[];
}
