/**
 * Validación de variables de entorno al ARRANCAR. Si algo está mal, el proceso no inicia
 * y muestra todos los problemas a la vez (mejor que descubrirlos con usuarios encima).
 * En producción las reglas son más estrictas.
 */

type Env = Record<string, unknown>;

export class InvalidEnvironmentError extends Error {
  constructor(readonly problems: string[]) {
    super(`Configuración inválida:\n  - ${problems.join('\n  - ')}`);
    this.name = 'InvalidEnvironmentError';
  }
}

export interface EnvWarnings {
  warnings: string[];
}

const str = (env: Env, key: string) => {
  const v = env[key];
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
};

export function validateEnv(env: Env): Env & EnvWarnings {
  const problems: string[] = [];
  const warnings: string[] = [];
  const nodeEnv = str(env, 'NODE_ENV') ?? 'development';
  const prod = nodeEnv === 'production';

  const oneOf = (key: string, allowed: string[], fallback: string) => {
    const v = str(env, key) ?? fallback;
    if (!allowed.includes(v))
      problems.push(
        `${key} debe ser uno de: ${allowed.join(', ')} (llegó "${v}")`,
      );
    return v;
  };
  const int = (key: string, min: number, max: number) => {
    const v = str(env, key);
    if (v === undefined) return;
    const n = Number(v);
    if (!Number.isInteger(n) || n < min || n > max) {
      problems.push(
        `${key} debe ser un entero entre ${min} y ${max} (llegó "${v}")`,
      );
    }
  };

  oneOf('NODE_ENV', ['development', 'test', 'production'], 'development');

  // Base de datos
  const db = str(env, 'DATABASE_URL');
  if (!db) problems.push('DATABASE_URL es obligatoria');
  else if (!/^postgres(ql)?:\/\//.test(db))
    problems.push('DATABASE_URL debe empezar con postgresql://');

  // JWT
  const secret = str(env, 'JWT_ACCESS_SECRET');
  if (!secret) problems.push('JWT_ACCESS_SECRET es obligatoria');
  else if (secret.length < 32) {
    problems.push(
      'JWT_ACCESS_SECRET debe tener al menos 32 caracteres (genere uno aleatorio)',
    );
  } else if (
    prod &&
    /secret|changeme|cambiar|pega_aqui|example/i.test(secret)
  ) {
    problems.push(
      'JWT_ACCESS_SECRET parece un valor de ejemplo; en producción use uno aleatorio',
    );
  }

  int('PORT', 1, 65535);
  int('JWT_ACCESS_TTL_SECONDS', 60, 86_400);
  int('REFRESH_TOKEN_TTL_DAYS', 1, 365);
  int('AUTH_MAX_FAILED_LOGINS', 1, 100);
  int('AUTH_LOCK_MINUTES', 1, 1_440);
  int('AUTH_LOGIN_RATE_LIMIT', 1, 100_000);
  int('PASSWORD_RESET_TTL_MINUTES', 5, 1_440);
  int('INVITE_TTL_HOURS', 1, 720);
  int('TRUST_PROXY_HOPS', 0, 10);
  int('LOCATION_RETENTION_DAYS', 30, 3_650);
  int('NOTIFICATION_RETENTION_DAYS', 7, 3_650);
  for (const key of [
    'ATTENDANCE_JOB_INTERVAL_SECONDS',
    'NOTIFICATIONS_DISPATCH_INTERVAL_SECONDS',
    'REMINDERS_INTERVAL_SECONDS',
    'PUSH_RECEIPTS_INTERVAL_SECONDS',
    'MAINTENANCE_INTERVAL_SECONDS',
  ]) {
    int(key, 0, 86_400);
  }

  // Correo
  const mail = oneOf('MAIL_TRANSPORT', ['console', 'smtp'], 'console');
  if (mail === 'smtp') {
    if (!str(env, 'SMTP_URL'))
      problems.push('MAIL_TRANSPORT=smtp requiere SMTP_URL');
    if (!str(env, 'MAIL_FROM'))
      problems.push('MAIL_TRANSPORT=smtp requiere MAIL_FROM');
  } else if (prod) {
    // Sin correo real, nadie podría recuperar su contraseña ni activar su cuenta
    problems.push(
      'En producción MAIL_TRANSPORT debe ser smtp (con console no llegan los correos)',
    );
  }

  const reset = str(env, 'PASSWORD_RESET_URL');
  if (reset && !reset.includes('{token}'))
    problems.push('PASSWORD_RESET_URL debe contener {token}');

  // Push
  const push = oneOf('PUSH_PROVIDER', ['console', 'expo'], 'console');
  if (prod && push === 'console')
    warnings.push(
      'PUSH_PROVIDER=console: las notificaciones no llegarán a los teléfonos',
    );

  // CORS
  const cors = str(env, 'CORS_ORIGINS');
  if (cors) {
    for (const origin of cors.split(',').map((o) => o.trim())) {
      if (origin === '*')
        problems.push(
          'CORS_ORIGINS no puede ser "*" (las cookies y tokens quedarían expuestos)',
        );
      else if (!/^https?:\/\/[^/\s]+$/.test(origin))
        problems.push(
          `CORS_ORIGINS: "${origin}" no es un origen válido (ej: https://panel.miempresa.com)`,
        );
      else if (
        prod &&
        origin.startsWith('http://') &&
        !/localhost|127\.0\.0\.1/.test(origin)
      ) {
        warnings.push(`CORS_ORIGINS: "${origin}" usa http en producción`);
      }
    }
  }

  // Redis (opcional): imprescindible con varias instancias
  const redis = str(env, 'REDIS_URL');
  if (redis && !/^rediss?:\/\//.test(redis))
    problems.push('REDIS_URL debe empezar con redis:// o rediss://');
  if (prod && !redis) {
    warnings.push(
      'Sin REDIS_URL: el límite de intentos de login es por instancia (con varias instancias se multiplica)',
    );
  }

  oneOf('SWAGGER_ENABLED', ['true', 'false'], prod ? 'false' : 'true');
  oneOf(
    'LOG_LEVEL',
    ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'],
    prod ? 'info' : 'debug',
  );

  if (problems.length) throw new InvalidEnvironmentError(problems);
  return { ...env, warnings };
}
