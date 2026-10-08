export const COMPANY_STATUS: Record<string, { label: string; tone: 'warn' | 'working' | 'missing' | 'done' }> = {
  TRIAL: { label: 'Prueba', tone: 'warn' },
  ACTIVE: { label: 'Activa', tone: 'working' },
  SUSPENDED: { label: 'Suspendida', tone: 'missing' },
  CANCELLED: { label: 'Cancelada', tone: 'done' },
};
