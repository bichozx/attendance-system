import { InvalidEnvironmentError, validateEnv } from './env.validation';

const ok = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_ACCESS_SECRET: 'x'.repeat(48),
};

const problems = (env: Record<string, string>) => {
  try {
    validateEnv(env);
    return [];
  } catch (e) {
    return (e as InvalidEnvironmentError).problems;
  }
};

describe('validateEnv', () => {
  it('acepta una configuración mínima de desarrollo', () => {
    expect(problems(ok)).toEqual([]);
  });

  it('reporta TODOS los problemas a la vez', () => {
    const p = problems({
      JWT_ACCESS_SECRET: 'corto',
      PORT: 'abc',
      MAIL_TRANSPORT: 'sendgrid',
    });
    expect(p).toHaveLength(4);
    expect(p.join(' ')).toMatch(
      /DATABASE_URL.*JWT_ACCESS_SECRET.*PORT.*MAIL_TRANSPORT/s,
    );
  });

  it('smtp exige SMTP_URL y MAIL_FROM', () => {
    expect(problems({ ...ok, MAIL_TRANSPORT: 'smtp' })).toHaveLength(2);
  });

  it('en producción: correo real obligatorio y secreto que no sea de ejemplo', () => {
    const p = problems({
      ...ok,
      NODE_ENV: 'production',
      JWT_ACCESS_SECRET: 'changeme-' + 'x'.repeat(40),
    });
    expect(p.join(' ')).toMatch(/valor de ejemplo/);
    expect(p.join(' ')).toMatch(/MAIL_TRANSPORT debe ser smtp/);
  });

  it('CORS: rechaza "*" y orígenes con ruta', () => {
    expect(problems({ ...ok, CORS_ORIGINS: '*' })).toHaveLength(1);
    expect(
      problems({ ...ok, CORS_ORIGINS: 'https://panel.com/app' }),
    ).toHaveLength(1);
    expect(
      problems({
        ...ok,
        CORS_ORIGINS: 'https://panel.com,http://localhost:3001',
      }),
    ).toEqual([]);
  });

  it('en producción sin Redis: arranca, pero avisa', () => {
    const env = validateEnv({
      ...ok,
      NODE_ENV: 'production',
      MAIL_TRANSPORT: 'smtp',
      SMTP_URL: 'smtps://u:p@smtp.x.com:465',
      MAIL_FROM: 'no-reply@x.com',
      PUSH_PROVIDER: 'expo',
    });
    expect(env.warnings.join(' ')).toMatch(/REDIS_URL/);
  });

  it('tokens de pocos segundos: permitidos en pruebas, no en producción', () => {
    expect(problems({ ...ok, JWT_ACCESS_TTL_SECONDS: '3' })).toEqual([]);
    expect(
      problems({
        ...ok,
        NODE_ENV: 'production',
        MAIL_TRANSPORT: 'smtp',
        SMTP_URL: 'smtps://x',
        MAIL_FROM: 'a@b.c',
        JWT_ACCESS_TTL_SECONDS: '3',
      }),
    ).toHaveLength(1);
  });

  it('PASSWORD_RESET_URL debe tener {token}', () => {
    expect(
      problems({ ...ok, PASSWORD_RESET_URL: 'https://panel.com/reset' }),
    ).toHaveLength(1);
  });
});
