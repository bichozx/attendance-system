import { InvalidCompanySettingsError } from './company.errors';
import { assertCompanySettings, blocksAccess, slugify } from './company.rules';

describe('slugify', () => {
  it.each([
    ['Panadería Doña Rosa S.A.S.', 'panaderia-dona-rosa-s-a-s'],
    ['  Tiendas   Ñapa  ', 'tiendas-napa'],
    ['Café & Té 24/7', 'cafe-te-24-7'],
  ])('%s → %s', (name, slug) => expect(slugify(name)).toBe(slug));

  it('limita la longitud sin dejar guiones al final', () => {
    const slug = slugify('a'.repeat(49) + ' bcd');
    expect(slug.length).toBeLessThanOrEqual(50);
    expect(slug.endsWith('-')).toBe(false);
  });
});

describe('assertCompanySettings', () => {
  it('acepta valores válidos', () => {
    expect(() =>
      assertCompanySettings({
        timezone: 'America/Bogota',
        country: 'CO',
        currency: 'COP',
        slug: 'panaderia-rosa',
        shiftDefaults: {
          earlyClockInMinutes: 10,
          lateToleranceMinutes: 5,
          breakMinutes: 60,
        },
      }),
    ).not.toThrow();
  });

  it.each([
    [{ timezone: 'Bogota' }],
    [{ country: 'COL' }],
    [{ currency: 'pesos' }],
    [{ slug: 'Con Mayúsculas' }],
    [{ shiftDefaults: { earlyClockInMinutes: 500 } }],
    [{ shiftDefaults: { breakMinutes: 2.5 } }],
  ])('rechaza %o', (changes) => {
    expect(() => assertCompanySettings(changes)).toThrow(
      InvalidCompanySettingsError,
    );
  });
});

describe('blocksAccess', () => {
  it('solo TRIAL y ACTIVE permiten operar', () => {
    expect(
      ['TRIAL', 'ACTIVE', 'SUSPENDED', 'CANCELLED'].map((s) =>
        blocksAccess(s as never),
      ),
    ).toEqual([false, false, true, true]);
  });
});
