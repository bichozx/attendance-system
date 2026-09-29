/**
 * Fechas sin hora (fecha de ingreso, nacimiento...). Se manejan como medianoche UTC
 * para que coincidan con las columnas @db.Date y no se corran por la zona horaria.
 */
export function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function formatDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}
