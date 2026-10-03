import { Injectable } from '@nestjs/common';
import { Workbook, type CellValue } from 'exceljs';
import { DomainError } from '../../../../shared/domain/domain-error';
import { parseCsv } from '../../domain/import/csv';
import {
  IMPORT_COLUMNS,
  RawRow,
  RowResult,
} from '../../domain/import/employee-import.rules';
import { headerKey } from '../../domain/import/values';

export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_ROWS = 2_000;

export class ImportFileError extends DomainError {
  readonly code = 'IMPORT_FILE_INVALID';
  readonly kind = 'VALIDATION';
}

/** Nombres alternativos frecuentes en archivos hechos a mano. */
const ALIASES: Record<string, string> = {
  documento: 'numero_documento',
  numero_de_documento: 'numero_documento',
  cedula: 'numero_documento',
  tipo_de_documento: 'tipo_documento',
  nombre: 'nombres',
  apellido: 'apellidos',
  email: 'correo',
  correo_electronico: 'correo',
  celular: 'telefono',
  fecha_de_ingreso: 'fecha_ingreso',
  fecha_de_nacimiento: 'fecha_nacimiento',
  establecimiento: 'sede',
  salario_base: 'salario',
  jornada: 'horas_semanales',
};

export interface ParsedSheet {
  headers: string[];
  rows: RawRow[];
}

@Injectable()
export class SpreadsheetIO {
  /** Lee .xlsx o .csv y devuelve filas por clave de columna, con su número real de fila. */
  async read(file: {
    buffer: Buffer;
    originalname: string;
    size: number;
  }): Promise<ParsedSheet> {
    if (file.size > MAX_FILE_BYTES)
      throw new ImportFileError('El archivo supera 2 MB');
    const ext = file.originalname.toLowerCase().split('.').pop();
    let matrix: { row: number; cells: unknown[] }[];

    if (ext === 'xlsx') {
      const workbook = new Workbook();
      try {
        await workbook.xlsx.load(file.buffer as never);
      } catch {
        throw new ImportFileError('No se pudo leer el archivo de Excel');
      }
      const sheet =
        workbook.getWorksheet('Empleados') ?? workbook.worksheets[0];
      if (!sheet) throw new ImportFileError('El archivo no tiene hojas');
      matrix = [];
      sheet.eachRow({ includeEmpty: false }, (row, n) => {
        matrix.push({
          row: n,
          cells: (row.values as CellValue[]).slice(1).map(cellValue),
        });
      });
    } else if (ext === 'csv') {
      let text = file.buffer.toString('utf8');
      // Excel en Windows suele guardar CSV en Windows-1252: si no es UTF-8 válido, se relee
      if (text.includes('\uFFFD')) text = file.buffer.toString('latin1');
      matrix = parseCsv(text).map((cells, i) => ({ row: i + 1, cells }));
    } else {
      throw new ImportFileError('Formato no soportado: use .xlsx o .csv');
    }

    const headerIndex = matrix.findIndex(
      (r) => r.cells.filter((c) => String(c ?? '').trim()).length >= 2,
    );
    if (headerIndex < 0)
      throw new ImportFileError('No se encontró la fila de encabezados');
    const headers = matrix[headerIndex].cells.map((h) => {
      const key = headerKey(String(h ?? ''));
      return ALIASES[key] ?? key;
    });

    const rows: RawRow[] = [];
    for (const { row, cells } of matrix.slice(headerIndex + 1)) {
      if (cells.every((c) => String(c ?? '').trim() === '')) continue; // fila vacía
      const record: RawRow = { __row: row };
      headers.forEach((h, i) => {
        if (h) record[h] = cells[i] ?? '';
      });
      rows.push(record);
    }
    if (rows.length > MAX_ROWS)
      throw new ImportFileError(`Máximo ${MAX_ROWS} filas por archivo`);
    return { headers, rows };
  }

  /** Plantilla .xlsx: hoja de datos con ejemplo + hoja de instrucciones y valores válidos. */
  async template(options: {
    positions: string[];
    stores: { code: string; name: string }[];
  }): Promise<Buffer> {
    const wb = new Workbook();
    const data = wb.addWorksheet('Empleados');
    data.addRow(IMPORT_COLUMNS.map((c) => c.key));
    data.addRow(IMPORT_COLUMNS.map((c) => c.example));
    data.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    data.getRow(1).eachCell((cell, i) => {
      const required = IMPORT_COLUMNS[i - 1]?.required;
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: required ? 'FF1D4ED8' : 'FF6B7280' },
      };
    });
    data.getRow(2).font = { italic: true, color: { argb: 'FF6B7280' } };
    IMPORT_COLUMNS.forEach((_, i) => (data.getColumn(i + 1).width = 18));
    data.views = [{ state: 'frozen', ySplit: 1 }];

    const help = wb.addWorksheet('Instrucciones');
    help.addRow(['Columna', 'Obligatoria', 'Descripción', 'Ejemplo']).font = {
      bold: true,
    };
    for (const c of IMPORT_COLUMNS)
      help.addRow([c.key, c.required ? 'Sí' : 'No', c.help, c.example]);
    help.addRow([]);
    help.addRow([
      'Borre la fila de ejemplo (fila 2 de la hoja Empleados) antes de importar.',
    ]).font = { bold: true };
    help.addRow([]);
    help.addRow(['Cargos existentes']).font = { bold: true };
    for (const p of options.positions) help.addRow([p]);
    help.addRow([]);
    help.addRow(['Establecimientos (código → nombre)']).font = { bold: true };
    for (const s of options.stores) help.addRow([s.code, '', s.name]);
    help.getColumn(1).width = 22;
    help.getColumn(3).width = 70;
    help.getColumn(4).width = 20;
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  /** Plantilla .csv con ";" (se abre bien en Excel en español). */
  templateCsv(): Buffer {
    const line = (values: string[]) =>
      values
        .map((v) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v))
        .join(';');
    const csv = [
      line(IMPORT_COLUMNS.map((c) => c.key)),
      line(IMPORT_COLUMNS.map((c) => c.example)),
    ].join('\r\n');
    return Buffer.from('\uFEFF' + csv, 'utf8'); // BOM: Excel reconoce las tildes
  }

  /** El archivo devuelto con una columna de errores por fila, listo para corregir y volver a subir. */
  async errorReport(headers: string[], results: RowResult[]): Promise<Buffer> {
    const wb = new Workbook();
    const sheet = wb.addWorksheet('Empleados');
    const columns = [...headers.filter(Boolean), 'fila_original', 'errores'];
    sheet.addRow(columns).font = { bold: true };
    for (const r of results) {
      const row = sheet.addRow([
        ...headers.filter(Boolean).map((h) => r.raw[h] ?? ''),
        r.row,
        r.errors.map((e) => `${e.field}: ${e.message}`).join(' | '),
      ]);
      if (r.errors.length) {
        row.getCell(columns.length).font = {
          color: { argb: 'FFB91C1C' },
          bold: true,
        };
        const bad = new Set(r.errors.map((e) => e.field));
        headers.filter(Boolean).forEach((h, i) => {
          if (bad.has(h)) {
            row.getCell(i + 1).fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFFEE2E2' },
            };
          }
        });
      }
    }
    sheet.getColumn(columns.length).width = 80;
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    return Buffer.from(await wb.xlsx.writeBuffer());
  }
}

/** Valor de celda de exceljs → valor simple (texto, número o fecha). */
function cellValue(v: CellValue): unknown {
  if (v === null || v === undefined) return '';
  if (v instanceof Date || typeof v !== 'object') return v;
  if ('richText' in v) return v.richText.map((t) => t.text).join('');
  if ('text' in v && typeof v.text === 'string') return v.text; // hipervínculo (ej. correos)
  if ('result' in v) return v.result ?? ''; // fórmula
  return String(v);
}
