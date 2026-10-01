import {
  DEFAULT_SECURITY_POLICY,
  isLocked,
  lockAfterFailure,
  secondsUntil,
} from './account-security';

const now = new Date('2026-10-16T14:00:00Z');

describe('account-security', () => {
  it('bloquea al llegar al máximo de intentos, por 15 minutos', () => {
    expect(lockAfterFailure(4, DEFAULT_SECURITY_POLICY, now)).toBeNull();
    expect(
      lockAfterFailure(5, DEFAULT_SECURITY_POLICY, now)?.toISOString(),
    ).toBe('2026-10-16T14:15:00.000Z');
  });

  it('el bloqueo vence solo', () => {
    const until = new Date('2026-10-16T14:15:00Z');
    expect(isLocked(until, now)).toBe(true);
    expect(isLocked(until, new Date('2026-10-16T14:15:01Z'))).toBe(false);
    expect(isLocked(null, now)).toBe(false);
    expect(secondsUntil(until, now)).toBe(900);
  });
});
