import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { ApiErrorDto } from './api-error.dto';

const DEFAULT_DESCRIPTIONS: Record<number, string> = {
  400: 'Datos inválidos (VALIDATION_ERROR)',
  401: 'No autenticado o token inválido',
  403: 'Sin permisos para esta acción',
  404: 'Recurso no encontrado',
  409: 'Conflicto con el estado actual',
  429: 'Demasiadas peticiones (TOO_MANY_REQUESTS)',
};

/**
 * Documenta respuestas de error con el formato ApiErrorDto.
 * Uso: @ApiErrors(400, 401) o @ApiErrors({ 401: 'INVALID_CREDENTIALS' })
 */
export function ApiErrors(...errors: (number | Record<number, string>)[]) {
  const entries = errors.flatMap((e) =>
    typeof e === 'number'
      ? [[e, DEFAULT_DESCRIPTIONS[e] ?? 'Error'] as const]
      : Object.entries(e).map(([s, d]) => [Number(s), d] as const),
  );

  return applyDecorators(
    ...entries.map(([status, description]) =>
      ApiResponse({ status, description, type: ApiErrorDto }),
    ),
  );
}
