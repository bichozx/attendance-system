import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';

export class TemplateQueryDto {
  @IsOptional()
  @IsIn(['xlsx', 'csv'])
  format?: 'xlsx' | 'csv';
}

export class ImportQueryDto {
  /** true = importa solo las filas válidas. Por defecto: todo o nada. */
  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  skipInvalid?: boolean;
}

export class ImportRowErrorDto {
  /** @example "numero_documento" */
  field: string;
  /** @example "Repetido en la fila 4" */
  message: string;
}

export class ImportRowDto {
  /** Fila tal como se ve en Excel. @example 7 */
  row: number;
  /** @example "EMP-105" */
  code: string;
  errors: ImportRowErrorDto[];
}

export class ImportPreviewDto {
  total: number;
  valid: number;
  invalid: number;
  withContract: number;
  withAppAccess: number;
  /** Primeras 300 filas con errores. */
  errors: ImportRowDto[];
}

export class ImportResultDto {
  created: number;
  /** Filas con errores omitidas (solo con skipInvalid). */
  skipped: number;
  withContract: number;
  /** Personas que recibieron la invitación para crear su contraseña. */
  invited: number;
  warnings: string[];
}
