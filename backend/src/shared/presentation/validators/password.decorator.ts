import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

/** Política de contraseñas: 8-128 caracteres, al menos una letra y un número. */
export function IsStrongPassword() {
  return applyDecorators(
    ApiProperty({
      minLength: 8,
      maxLength: 128,
      example: 'Temporal2026',
      description: 'Mínimo 8 caracteres, con al menos una letra y un número',
    }),
    IsString(),
    MinLength(8),
    MaxLength(128),
    Matches(/^(?=.*[A-Za-z])(?=.*\d)/, {
      message: 'password must contain at least one letter and one number',
    }),
  );
}
