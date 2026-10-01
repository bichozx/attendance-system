import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { IsStrongPassword } from '../../../../shared/presentation/validators/password.decorator';

export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  currentPassword: string;

  @IsStrongPassword()
  newPassword: string;
}

export class ForgotPasswordDto {
  /** @example "empleado@demo.local" */
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsEmail()
  @MaxLength(254)
  email: string;
}

export class ResetPasswordDto {
  /** El token que llegó en el enlace del correo. */
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43}$/, { message: 'token is not valid' })
  token: string;

  @IsStrongPassword()
  newPassword: string;
}

export class ChangePasswordResponseDto {
  /** Access token nuevo (ya sin la marca de contraseña temporal). */
  accessToken: string;
  /** @example 900 */
  accessTokenExpiresIn: number;
  /** Sesiones cerradas en otros dispositivos. @example 1 */
  closedSessions: number;
}

export class SessionResponseDto {
  id: string;
  companyId: string | null;
  /** @example "Empresa Demo" */
  companyName: string | null;
  /** @example "okhttp/4.12.0" */
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: Date;
  expiresAt: Date;
  /** true = la sesión de esta petición. */
  current: boolean;
}

export class AcceptedResponseDto {
  /** @example "Si el correo está registrado, recibirás un enlace para restablecer la contraseña." */
  message: string;
}
