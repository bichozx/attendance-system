/** Interpretación de valores tal como los escriben las personas en Colombia. */

const pad = (n: number) => String(n).padStart(2, '0');

function validYmd(y: number, m: number, d: number): string | null {
  const date = new Date(Date.UTC(y, m - 1, d));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  )
    return null;
  if (y < 1900 || y > 2100) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/**
 * Fecha → "AAAA-MM-DD". Acepta: celda de fecha de Excel, número de serie de Excel,
 * "2026-01-15", "15/01/2026", "15-01-2026", "5/1/2026". Devuelve null si no es válida
 * (incluye fechas imposibles como 31/02).
 */
export function parseDate(value: unknown): string | null {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return validYmd(
      value.getUTCFullYear(),
      value.getUTCMonth() + 1,
      value.getUTCDate(),
    );
  }
  if (typeof value === 'number' && value > 0 && value < 100_000) {
    // Número de serie de Excel (días desde 1899-12-30)
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86_400_000);
    return validYmd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  const s = String(value ?? '').trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return validYmd(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
  if (m) return validYmd(+m[3], +m[2], +m[1]); // día/mes/año
  return null;
}

/**
 * Monto → "1234567.89" (texto, para no perder precisión). Entiende el formato colombiano
 * ("2.500.000", "2.500.000,50", "$ 2.500.000") y el anglosajón ("2,500,000.50").
 */
export function parseMoney(value: unknown): string | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? value.toFixed(2) : null;
  }
  let s = String(value ?? '')
    .replace(/[\s$]/g, '')
    .replace(/COP$/i, '');
  if (!/^[0-9.,]+$/.test(s)) return null;

  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  let decimalSep: '.' | ',' | null = null;
  if (lastDot >= 0 && lastComma >= 0)
    decimalSep = lastDot > lastComma ? '.' : ',';
  else {
    const sep = lastDot >= 0 ? '.' : lastComma >= 0 ? ',' : null;
    // Un solo tipo de separador: es decimal solo si aparece una vez con 1-2 dígitos detrás
    if (
      sep &&
      s.split(sep).length === 2 &&
      /^\d{1,2}$/.test(s.slice(s.lastIndexOf(sep) + 1))
    ) {
      decimalSep = sep;
    }
  }
  const [intPart, decPart = ''] = decimalSep
    ? [
        s.slice(0, s.lastIndexOf(decimalSep)),
        s.slice(s.lastIndexOf(decimalSep) + 1),
      ]
    : [s, ''];
  const digits = intPart.replace(/[.,]/g, '');
  if (!/^\d+$/.test(digits) || decPart.length > 2 || !/^\d*$/.test(decPart))
    return null;
  s = `${digits}.${decPart.padEnd(2, '0')}`;
  return s.replace(/^0+(?=\d)/, '');
}

/** "SI", "Sí", "x", "true", "1" → true. Vacío/"NO" → false. Otro → null (inválido). */
export function parseYesNo(value: unknown): boolean | null {
  const s = normalize(String(value ?? ''));
  if (['', 'no', 'n', 'false', '0'].includes(s)) return false;
  if (['si', 's', 'x', 'true', '1', 'yes'].includes(s)) return true;
  return null;
}

/** Minúsculas, sin tildes ni espacios sobrantes (para comparar nombres y encabezados). */
export function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** Encabezado de columna → clave: "Número de documento" → "numero_de_documento". */
export function headerKey(header: string): string {
  return normalize(header)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}
