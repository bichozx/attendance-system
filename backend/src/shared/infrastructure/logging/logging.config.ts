import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Params } from 'nestjs-pino';

/** Nunca deben llegar a un log (ni de desarrollo). */
export const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  '*.password',
  '*.newPassword',
  '*.currentPassword',
  '*.passwordHash',
  '*.refreshToken',
  '*.accessToken',
  '*.token',
  '*.secret',
];

/**
 * Logs estructurados (JSON) con un id por petición. En desarrollo, legibles (pino-pretty).
 * El id llega en el encabezado x-request-id (o se genera) y se devuelve en la respuesta,
 * así un error reportado por un usuario se encuentra en los logs.
 */
export function loggingConfig(env: {
  NODE_ENV?: string;
  LOG_LEVEL?: string;
  LOG_PRETTY?: string;
}): Params {
  const prod = env.NODE_ENV === 'production';
  const pretty = env.LOG_PRETTY ? env.LOG_PRETTY === 'true' : !prod;
  return {
    pinoHttp: {
      level: env.LOG_LEVEL ?? (prod ? 'info' : 'debug'),
      redact: { paths: REDACTED_PATHS, censor: '[REDACTADO]' },
      genReqId: (req: IncomingMessage, res: ServerResponse) => {
        const incoming = req.headers['x-request-id'];
        const id =
          typeof incoming === 'string' && /^[\w-]{8,64}$/.test(incoming)
            ? incoming
            : randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
      // Quién hizo la petición (se resuelve al terminar, cuando el guard ya autenticó)
      customProps: (req) => {
        const user = (
          req as IncomingMessage & {
            user?: { userId: string; companyId: string | null };
          }
        ).user;
        return user ? { userId: user.userId, companyId: user.companyId } : {};
      },
      // Los health checks se consultan cada pocos segundos: no ensucian los logs
      autoLogging: { ignore: (req) => (req.url ?? '').startsWith('/health') },
      serializers: {
        req: (req: { id: string; method: string; url: string }) => ({
          id: req.id,
          method: req.method,
          url: req.url,
        }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
      customLogLevel: (_req, res, error) =>
        error || res.statusCode >= 500
          ? 'error'
          : res.statusCode >= 400
            ? 'warn'
            : 'info',
      ...(pretty && {
        transport: {
          target: 'pino-pretty',
          options: {
            singleLine: true,
            translateTime: 'SYS:HH:MM:ss',
            ignore: 'pid,hostname',
          },
        },
      }),
    },
  };
}
