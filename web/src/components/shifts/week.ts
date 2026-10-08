/** Utilidades de fechas locales "AAAA-MM-DD" (sin depender de la zona del computador). */

const DAY = 86_400_000;
const noon = (d: string) => Date.parse(`${d}T12:00:00Z`);

export const addDays = (d: string, n: number) => new Date(noon(d) + n * DAY).toISOString().slice(0, 10);

export const daysBetween = (from: string, to: string) => Math.round((noon(to) - noon(from)) / DAY);

export function todayIn(timeZone: string) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/** Lunes de la semana de `d`. */
export function mondayOf(d: string) {
  const weekday = new Date(noon(d)).getUTCDay(); // 0 = domingo
  return addDays(d, -((weekday + 6) % 7));
}

export const weekDays = (monday: string) => Array.from({ length: 7 }, (_, i) => addDays(monday, i));

const fmt = (d: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('es-CO', { ...opts, timeZone: 'UTC' }).format(new Date(noon(d)));

/** "12 – 18 oct 2026" o "28 sept – 4 oct 2026" */
export function rangeLabel(from: string, to: string) {
  const sameMonth = from.slice(0, 7) === to.slice(0, 7);
  const start = sameMonth ? fmt(from, { day: 'numeric' }) : fmt(from, { day: 'numeric', month: 'short' });
  return `${start} – ${fmt(to, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

export const weekdayShort = (d: string) => fmt(d, { weekday: 'short' }).replace('.', '');
export const dayNumber = (d: string) => fmt(d, { day: 'numeric' });
export const weekdayLong = (d: string) => fmt(d, { weekday: 'long', day: 'numeric', month: 'long' });

/** "14:00" + "22:00" → minutos de duración (nocturno si termina antes o igual). */
export function spanMinutes(start: string, end: string) {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let m = eh * 60 + em - (sh * 60 + sm);
  if (m <= 0) m += 1440;
  return m;
}

export const hours = (minutes: number) => {
  const h = minutes / 60;
  return `${Number.isInteger(h) ? h : h.toFixed(1).replace('.', ',')} h`;
};
