/** Tabla neutral que los escritores convierten en Excel o PDF. */
export type ColumnType = 'text' | 'minutes' | 'number';

export interface ReportColumn {
  key: string;
  header: string;
  type?: ColumnType;
  /** Ancho relativo (Excel: caracteres; PDF: proporción). */
  width?: number;
}

export type ReportValue = string | number | null;

export interface ReportTable {
  title: string;
  /** Ej: "Empresa Demo · 1–15 oct 2026 · Tienda Centro" */
  subtitle: string;
  generatedAt: string;
  columns: ReportColumn[];
  rows: Record<string, ReportValue>[];
  /** Fila de totales (suma automática de columnas minutes/number si se omite). */
  totals?: boolean;
}

/** 435 → "7:15" */
export function formatMinutes(value: number | null): string {
  if (value === null || value === undefined) return '';
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  return `${sign}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, '0')}`;
}

export function totalsOf(table: ReportTable): Record<string, ReportValue> {
  const totals: Record<string, ReportValue> = {};
  for (const col of table.columns) {
    if (col.type === 'minutes' || col.type === 'number') {
      totals[col.key] = table.rows.reduce(
        (sum, r) => sum + (Number(r[col.key]) || 0),
        0,
      );
    }
  }
  totals[table.columns[0].key] = 'Total';
  return totals;
}

export abstract class ReportWriter {
  abstract readonly contentType: string;
  abstract readonly extension: string;
  abstract write(table: ReportTable): Promise<Buffer>;
}
