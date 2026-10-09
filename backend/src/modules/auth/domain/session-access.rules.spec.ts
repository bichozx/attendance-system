import type { AuthenticatedUser } from '../../../shared/auth/authenticated-user';
import type { LiveSessionAccess } from './ports/session-access.reader';
import { resolveLiveAccess } from './session-access.rules';

const now = new Date('2026-10-09T12:00:00Z');
const claims: AuthenticatedUser = {
  userId: 'u-1',
  sessionId: 's-1',
  companyId: 'c-1',
  isPlatformAdmin: false,
  permissions: ['shifts.read', 'shifts.manage'],
  mustChangePassword: false,
};
const live = (over: Partial<LiveSessionAccess> = {}): LiveSessionAccess => ({
  userId: 'u-1',
  companyId: 'c-1',
  revokedAt: null,
  expiresAt: new Date('2026-11-01T00:00:00Z'),
  userStatus: 'ACTIVE',
  isPlatformAdmin: false,
  mustChangePassword: false,
  permissions: ['shifts.read', 'shifts.manage'],
  ...over,
});

describe('resolveLiveAccess', () => {
  it('acepta una sesión vigente', () => {
    expect(resolveLiveAccess(claims, live(), now)).toEqual(claims);
  });

  it('rechaza si la sesión no existe, se cerró o venció', () => {
    expect(resolveLiveAccess(claims, null, now)).toBeNull();
    expect(resolveLiveAccess(claims, live({ revokedAt: now }), now)).toBeNull();
    expect(resolveLiveAccess(claims, live({ expiresAt: now }), now)).toBeNull();
  });

  it('rechaza un token que no corresponde a la sesión', () => {
    expect(resolveLiveAccess(claims, live({ userId: 'otro' }), now)).toBeNull();
    expect(
      resolveLiveAccess(claims, live({ companyId: 'c-2' }), now),
    ).toBeNull();
  });

  it('rechaza si la cuenta ya no está activa', () => {
    expect(
      resolveLiveAccess(claims, live({ userStatus: 'LOCKED' }), now),
    ).toBeNull();
    expect(
      resolveLiveAccess(claims, live({ userStatus: 'INACTIVE' }), now),
    ).toBeNull();
  });

  it('rechaza si se retiró la membresía o se suspendió la empresa', () => {
    expect(
      resolveLiveAccess(claims, live({ permissions: null }), now),
    ).toBeNull();
  });

  it('aplica de inmediato un cambio de rol', () => {
    const r = resolveLiveAccess(
      claims,
      live({ permissions: ['attendance.clock'] }),
      now,
    );
    expect(r?.permissions).toEqual(['attendance.clock']);
  });

  it('sin empresa solo vale para el superadmin', () => {
    const noCompany = { ...claims, companyId: null };
    expect(
      resolveLiveAccess(
        noCompany,
        live({ companyId: null, permissions: null }),
        now,
      ),
    ).toBeNull();
    const r = resolveLiveAccess(
      { ...noCompany, isPlatformAdmin: true },
      live({ companyId: null, permissions: null, isPlatformAdmin: true }),
      now,
    );
    expect(r?.isPlatformAdmin).toBe(true);
    expect(r?.permissions).toEqual([]);
  });

  it('usa el estado actual de la contraseña temporal', () => {
    const r = resolveLiveAccess(
      { ...claims, mustChangePassword: true },
      live({ mustChangePassword: false }),
      now,
    );
    expect(r?.mustChangePassword).toBe(false);
  });
});
