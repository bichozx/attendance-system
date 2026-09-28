import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class LoginDto {
  /** @example "admin@demo.local" */
  @IsEmail()
  @MaxLength(254)
  email: string;

  /** @example "Demo123!" */
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password: string;

  /**
   * Solo si el usuario pertenece a varias empresas y la respuesta anterior
   * fue COMPANY_SELECTION_REQUIRED.
   */
  @IsOptional()
  @IsUUID()
  companyId?: string;
}
