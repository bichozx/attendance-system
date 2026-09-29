import { addDays, localToUtc, todayIn, utcToLocal } from './zoned-time';

describe('zoned-time', () => {
  it('Bogotá (UTC-5, sin horario de verano)', () => {
    expect(
      localToUtc('2026-10-16', '14:00', 'America/Bogota').toISOString(),
    ).toBe('2026-10-16T19:00:00.000Z');
    expect(
      localToUtc('2026-10-16', '22:00', 'America/Bogota').toISOString(),
    ).toBe('2026-10-17T03:00:00.000Z');
  });

  it('ida y vuelta conserva fecha y hora local', () => {
    const utc = localToUtc('2026-12-31', '23:30', 'America/Bogota');
    expect(utcToLocal(utc, 'America/Bogota')).toEqual({
      date: '2026-12-31',
      time: '23:30',
    });
  });

  it('respeta el horario de verano (Nueva York: -4 en julio, -5 en enero)', () => {
    expect(
      localToUtc('2026-07-01', '09:00', 'America/New_York').toISOString(),
    ).toBe('2026-07-01T13:00:00.000Z');
    expect(
      localToUtc('2026-01-15', '09:00', 'America/New_York').toISOString(),
    ).toBe('2026-01-15T14:00:00.000Z');
  });

  it('todayIn usa la fecha local, no la UTC', () => {
    // 02:00 UTC del 17 = 21:00 del 16 en Bogotá
    expect(todayIn('America/Bogota', new Date('2026-10-17T02:00:00Z'))).toBe(
      '2026-10-16',
    );
  });

  it('addDays cruza meses y años', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});
