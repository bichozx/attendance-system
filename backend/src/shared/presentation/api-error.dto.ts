/** Formato único de error de la API (dominio, validación, auth, rate limit). */
export class ApiErrorDto {
  /** @example 401 */
  statusCode: number;

  /**
   * Código estable para que el frontend decida qué hacer.
   * @example "INVALID_CREDENTIALS"
   */
  code: string;

  /** @example "Correo o contraseña incorrectos" */
  message: string;

  /** Información adicional (errores de validación, empresas para elegir, etc.). */
  details?: Record<string, unknown>;
}
