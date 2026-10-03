import { Workbook } from 'exceljs';
import { ReportTable } from '../domain/report-table';
import { ExcelReportWriter } from './excel-report.writer';
import { PdfReportWriter } from './pdf-report.writer';

const table = (rows: number): ReportTable => ({
  title: 'Detalle de asistencia',
  subtitle: 'Empresa Demo · 1–15 oct 2026',
  generatedAt: '2026-10-16 08:00',
  columns: [
    { key: 'name', header: 'Empleado', width: 24 },
    { key: 'store', header: 'Establecimiento', width: 18 },
    { key: 'worked', header: 'Trabajado', type: 'minutes', width: 10 },
    { key: 'late', header: 'Tarde (min)', type: 'number', width: 10 },
  ],
  rows: Array.from({ length: rows }, (_, i) => ({
    name: `Empleado Ñúñez ${i + 1}`,
    store: 'Tienda Centro',
    worked: 435,
    late: i % 3,
  })),
  totals: true,
});

describe('ExcelReportWriter', () => {
  it('escribe títulos, filas, duraciones [h]:mm y totales', async () => {
    const buffer = await new ExcelReportWriter().write(table(3));
    const wb = new Workbook();
    await wb.xlsx.load(buffer as never);
    const sheet = wb.worksheets[0];
    expect(sheet.getCell('A1').value).toBe('Detalle de asistencia');
    expect(sheet.getCell('A4').value).toBe('Empleado');
    expect(sheet.getCell('A5').value).toBe('Empleado Ñúñez 1');
    // Al leer, exceljs devuelve las duraciones como fecha sobre la época de Excel (1899-12-30)
    const minutes = (v: unknown) =>
      ((v as Date).getTime() - Date.UTC(1899, 11, 30)) / 60_000;
    expect(minutes(sheet.getCell('C5').value)).toBeCloseTo(435);
    expect(sheet.getCell('C5').numFmt).toBe('[h]:mm');
    // Fila de totales: 3 × 7:15 = 21:45
    expect(sheet.getCell('A8').value).toBe('Total');
    expect(minutes(sheet.getCell('C8').value)).toBeCloseTo(1305);
    expect(sheet.getCell('D8').value).toBe(3);
  });
});

describe('PdfReportWriter', () => {
  it('genera un PDF válido y pagina las tablas largas', async () => {
    const small = await new PdfReportWriter().write(table(5));
    const large = await new PdfReportWriter().write(table(200));
    expect(small.subarray(0, 5).toString()).toBe('%PDF-');
    const pages = (b: Buffer) =>
      (b.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length;
    expect(pages(small)).toBe(1);
    expect(pages(large)).toBeGreaterThan(3);
  });
});
