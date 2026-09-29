/**
 * Conversión entre hora local de una zona IANA y UTC, sin dependencias externas.
 * Funciona también con zonas con horario de verano (se prueba con America/New_York).
 */

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

function localParts(utc: Date, timeZone: string) {
  const parts = Object.fromEntries(
    formatter(timeZone)
      .formatToParts(utc)
      .map((p) => [p.type, p.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

/** Minutos que la zona está adelantada respecto a UTC en ese instante (Bogotá: -300). */
function offsetMinutes(utcMs: number, timeZone: string): number {
  const p = localParts(new Date(utcMs), timeZone);
  const asUtc = Date.UTC(
    p.year,
    p.month - 1,
    p.day,
    p.hour,
    p.minute,
    p.second,
  );
  return Math.round((asUtc - Math.floor(utcMs / 1000) * 1000) / 60_000);
}

/** "2026-10-16" + "14:00" en America/Bogota → 2026-10-16T19:00:00Z */
export function localToUtc(date: string, time: string, timeZone: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const naive = Date.UTC(y, m - 1, d, hh, mm);

  // Dos pasadas para resolver bien los cambios de horario de verano
  const first = offsetMinutes(naive, timeZone);
  let utc = naive - first * 60_000;
  const second = offsetMinutes(utc, timeZone);
  if (second !== first) utc = naive - second * 60_000;
  return new Date(utc);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Instante UTC → fecha y hora locales ("2026-10-16", "14:00"). */
export function utcToLocal(
  utc: Date,
  timeZone: string,
): { date: string; time: string } {
  const p = localParts(utc, timeZone);
  return {
    date: `${p.year}-${pad(p.month)}-${pad(p.day)}`,
    time: `${pad(p.hour)}:${pad(p.minute)}`,
  };
}

/** Fecha local de hoy en la zona dada ("2026-10-16"). */
export function todayIn(timeZone: string, now = new Date()): string {
  return utcToLocal(now, timeZone).date;
}

/** Suma días a una fecha "YYYY-MM-DD". */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
