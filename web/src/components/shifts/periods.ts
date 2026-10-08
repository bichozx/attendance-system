import type { Schemas } from '@/lib/api/client';

export type Period = Schemas['PeriodResponseDto'];

export const PERIOD_STATUS: Record<string, { label: string; tone: 'warn' | 'working' | 'done' }> = {
  DRAFT: { label: 'Borrador', tone: 'warn' },
  PUBLISHED: { label: 'Publicado', tone: 'working' },
  CLOSED: { label: 'Cerrado', tone: 'done' },
};

/** Periodo que cubre `date` para la sede: primero uno de la sede, si no uno de toda la empresa. */
export function periodFor(periods: Period[], storeId: string, date: string): Period | null {
  const covering = periods.filter((p) => p.startDate <= date && date <= p.endDate && (p.storeId === storeId || p.storeId === null));
  return covering.find((p) => p.storeId === storeId) ?? covering[0] ?? null;
}

/** Quincena que contiene `date`: 1–15 o 16–fin de mes. */
export function fortnightOf(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, '0');
  return d <= 15 ? { startDate: `${y}-${mm}-01`, endDate: `${y}-${mm}-15` } : { startDate: `${y}-${mm}-16`, endDate: `${y}-${mm}-${last}` };
}
