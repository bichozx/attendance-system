import { Injectable } from '@nestjs/common';
import { Workbook } from 'exceljs';
import { ReportTable, ReportWriter, totalsOf } from '../domain/report-table';

const HEADER_FILL = 'FF1D4ED8';

/**
 * Excel con formato: encabezado fijo, filtros y totales. Los minutos se guardan como
 * DURACIÓN (formato [h]:mm): se ven "7:15" y se pueden sumar con fórmulas.
 */
@Injectable()
export class ExcelReportWriter extends ReportWriter {
  readonly contentType =
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  readonly extension = 'xlsx';

  async write(table: ReportTable): Promise<Buffer> {
    const workbook = new Workbook();
    workbook.creator = 'Control de Asistencia';
    workbook.created = new Date();
    const sheet = workbook.addWorksheet(table.title.slice(0, 31));
    const lastCol = table.columns.length;

    sheet.mergeCells(1, 1, 1, lastCol);
    sheet.getCell(1, 1).value = table.title;
    sheet.getCell(1, 1).font = { bold: true, size: 14 };
    sheet.mergeCells(2, 1, 2, lastCol);
    sheet.getCell(2, 1).value =
      `${table.subtitle} · Generado: ${table.generatedAt}`;
    sheet.getCell(2, 1).font = { italic: true, color: { argb: 'FF6B7280' } };

    const headerRow = sheet.getRow(4);
    table.columns.forEach((col, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = col.header;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: HEADER_FILL },
      };
      cell.alignment = { vertical: 'middle', wrapText: true };
      sheet.getColumn(i + 1).width = col.width ?? 14;
    });
    headerRow.height = 30;

    const writeRow = (
      rowNumber: number,
      values: Record<string, unknown>,
      bold = false,
    ) => {
      const row = sheet.getRow(rowNumber);
      table.columns.forEach((col, i) => {
        const cell = row.getCell(i + 1);
        const v = values[col.key];
        if (col.type === 'minutes' && typeof v === 'number') {
          cell.value = v / 1440; // fracción de día = duración en Excel
          cell.numFmt = '[h]:mm';
        } else {
          cell.value = (v ?? null) as never;
        }
        if (bold) cell.font = { bold: true };
      });
    };

    table.rows.forEach((r, i) => writeRow(5 + i, r));
    if (table.totals && table.rows.length) {
      writeRow(5 + table.rows.length, totalsOf(table), true);
    }

    sheet.views = [{ state: 'frozen', ySplit: 4 }];
    sheet.autoFilter = {
      from: { row: 4, column: 1 },
      to: { row: 4 + table.rows.length, column: lastCol },
    };

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
}
