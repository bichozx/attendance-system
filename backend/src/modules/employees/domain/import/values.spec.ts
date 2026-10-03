import { parseCsv } from './csv';
import { headerKey, parseDate, parseMoney, parseYesNo } from './values';

describe('parseCsv', () => {
  it('detecta ";" (Excel en español) y respeta comillas con separadores y saltos de línea', () => {
    const csv =
      '\uFEFFcodigo;nombres;nota\r\nE1;"Pérez; Ana";"línea 1\nlínea 2"\r\nE2;Luis;"dice ""hola"""\r\n';
    expect(parseCsv(csv)).toEqual([
      ['codigo', 'nombres', 'nota'],
      ['E1', 'Pérez; Ana', 'línea 1\nlínea 2'],
      ['E2', 'Luis', 'dice "hola"'],
    ]);
  });
  it('también acepta ","', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});

describe('parseDate', () => {
  it.each([
    ['2026-01-15', '2026-01-15'],
    ['15/01/2026', '2026-01-15'],
    ['5/1/2026', '2026-01-05'],
    ['15-01-2026', '2026-01-15'],
    [46037, '2026-01-15'], // número de serie de Excel
    [new Date(Date.UTC(2026, 0, 15)), '2026-01-15'],
    ['31/02/2026', null], // no existe
    ['2026-13-01', null],
    ['ayer', null],
  ])('%p → %p', (input, expected) => expect(parseDate(input)).toBe(expected));
});

describe('parseMoney', () => {
  it.each([
    ['2.500.000', '2500000.00'],
    ['$ 2.500.000', '2500000.00'],
    ['2.500.000,50', '2500000.50'],
    ['2,500,000.50', '2500000.50'],
    ['2500000', '2500000.00'],
    ['1423500,5', '1423500.50'],
    ['1.500', '1500.00'], // punto con 3 dígitos: miles
    ['1500.5', '1500.50'],
    [2500000, '2500000.00'],
    ['dos millones', null],
    ['-5', null],
  ])('%p → %p', (input, expected) => expect(parseMoney(input)).toBe(expected));
});

describe('parseYesNo y headerKey', () => {
  it('interpreta sí/no', () => {
    expect([
      parseYesNo('Sí'),
      parseYesNo('x'),
      parseYesNo(''),
      parseYesNo('NO'),
      parseYesNo('tal vez'),
    ]).toEqual([true, true, false, false, null]);
  });
  it('normaliza encabezados', () => {
    expect(headerKey(' Número de Documento ')).toBe('numero_de_documento');
    expect(headerKey('Fecha Ingreso')).toBe('fecha_ingreso');
  });
});
