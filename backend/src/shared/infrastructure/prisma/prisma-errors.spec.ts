import { Prisma } from '../../../generated/prisma/client';
import { isTransientDbError, shortDbError } from './prisma-errors';

const known = (code: string, meta?: Record<string, unknown>) =>
  new Prisma.PrismaClientKnownRequestError('boom', {
    code,
    clientVersion: 'test',
    meta,
  });

describe('isTransientDbError', () => {
  it('reconoce las fallas pasajeras de conexión', () => {
    expect(isTransientDbError(known('P2028'))).toBe(true); // transacción sin conexión a tiempo
    expect(isTransientDbError(known('P1001'))).toBe(true);
    expect(
      isTransientDbError(
        known('P2010', {
          driverAdapterError: { cause: { kind: 'DatabaseNotReachable' } },
        }),
      ),
    ).toBe(true);
    expect(
      isTransientDbError(Object.assign(new Error('x'), { code: 'ECONNRESET' })),
    ).toBe(true);
  });

  it('no esconde errores reales', () => {
    expect(isTransientDbError(known('P2002'))).toBe(false); // dato duplicado
    expect(
      isTransientDbError(
        known('P2010', {
          driverAdapterError: { cause: { kind: 'TableDoesNotExist' } },
        }),
      ),
    ).toBe(false); // faltan migraciones: hay que verlo
    expect(isTransientDbError(new TypeError('bug'))).toBe(false);
  });

  it('resume el error en una línea', () => {
    expect(shortDbError(known('P2028'))).toBe('P2028: boom');
  });
});
