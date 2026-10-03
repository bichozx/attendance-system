import { cutoffs, DEFAULT_RETENTION } from './retention';

describe('cutoffs', () => {
  it('calcula la fecha límite de cada dato', () => {
    const c = cutoffs(DEFAULT_RETENTION, new Date('2026-10-01T12:00:00Z'));
    expect(c.location.toISOString()).toBe('2025-10-01T12:00:00.000Z');
    expect(c.notifications.toISOString()).toBe('2026-04-04T12:00:00.000Z');
    expect(c.sessions.toISOString()).toBe('2026-09-01T12:00:00.000Z');
    expect(c.resetTokens.toISOString()).toBe('2026-09-24T12:00:00.000Z');
  });
});
