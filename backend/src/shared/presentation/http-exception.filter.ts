import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import type { ApiErrorDto } from './api-error.dto';

const CODE_BY_STATUS: Partial<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'PAYLOAD_TOO_LARGE',
  [HttpStatus.TOO_MANY_REQUESTS]: 'TOO_MANY_REQUESTS',
};

/**
 * Normaliza las HttpException de Nest (validación, guards, throttler, 404 de rutas)
 * al mismo formato que los errores de dominio: { statusCode, code, message, details? }.
 */
@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const status = exception.getStatus();
    const raw = exception.getResponse();
    const message =
      typeof raw === 'string'
        ? raw
        : (raw as { message?: string | string[] }).message;

    const isValidation = status === 400 && Array.isArray(message);

    const body: ApiErrorDto = {
      statusCode: status,
      code: isValidation
        ? 'VALIDATION_ERROR'
        : (CODE_BY_STATUS[status] ?? 'HTTP_ERROR'),
      message: isValidation
        ? 'Los datos enviados no son válidos'
        : typeof message === 'string'
          ? message
          : exception.message,
      ...(isValidation && { details: { errors: message } }),
    };

    response.status(status).json(body);
  }
}
