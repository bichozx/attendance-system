import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import {
  formatMinutes,
  ReportTable,
  ReportValue,
  ReportWriter,
  totalsOf,
} from '../domain/report-table';

const MARGIN = 28;
const ROW = 14;
const HEADER_ROW = 24; // dos líneas: los encabezados no se cortan
const FONT_SIZE = 7.5;

/** PDF horizontal (A4) con encabezado repetido en cada página y numeración. */
@Injectable()
export class PdfReportWriter extends ReportWriter {
  readonly contentType = 'application/pdf';
  readonly extension = 'pdf';

  write(table: ReportTable): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
        margin: MARGIN,
        bufferPages: true,
        info: { Title: table.title, Creator: 'Control de Asistencia' },
      });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const usable = doc.page.width - MARGIN * 2;
      const weights = table.columns.map((c) => c.width ?? 12);
      const totalWeight = weights.reduce((a, b) => a + b, 0);
      const widths = weights.map((w) => (w / totalWeight) * usable);

      const text = (value: ReportValue, type?: string) =>
        type === 'minutes' && typeof value === 'number'
          ? formatMinutes(value)
          : String(value ?? '');

      const drawRow = (
        values: Record<string, ReportValue>,
        opts: { header?: boolean; shade?: boolean; bold?: boolean },
      ) => {
        const y = doc.y;
        if (opts.header)
          doc.rect(MARGIN, y, usable, HEADER_ROW).fill('#1D4ED8');
        else if (opts.shade) doc.rect(MARGIN, y, usable, ROW).fill('#F3F4F6');
        doc
          .fillColor(opts.header ? '#FFFFFF' : '#111827')
          .font(opts.header || opts.bold ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(FONT_SIZE);
        let x = MARGIN;
        table.columns.forEach((col, i) => {
          const numeric = col.type === 'minutes' || col.type === 'number';
          if (opts.header) {
            // Encabezado en hasta dos líneas: nunca se corta
            doc.text(col.header, x + 2, y + 3, {
              width: widths[i] - 4,
              height: HEADER_ROW - 4,
            });
          } else {
            doc.text(text(values[col.key], col.type), x + 2, y + 3, {
              width: widths[i] - 4,
              height: ROW,
              ellipsis: true,
              lineBreak: false,
              align: numeric ? 'right' : 'left',
            });
          }
          x += widths[i];
        });
        doc.x = MARGIN;
        doc.y = y + (opts.header ? HEADER_ROW : ROW);
      };

      const header = () => drawRow({}, { header: true });

      doc
        .font('Helvetica-Bold')
        .fontSize(13)
        .fillColor('#111827')
        .text(table.title);
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#6B7280')
        .text(`${table.subtitle} · Generado: ${table.generatedAt}`);
      doc.moveDown(0.6);
      header();

      const bottom = doc.page.height - MARGIN - ROW * 2;
      table.rows.forEach((row, i) => {
        if (doc.y > bottom) {
          doc.addPage();
          header();
        }
        drawRow(row, { shade: i % 2 === 1 });
      });
      if (table.totals && table.rows.length) {
        if (doc.y > bottom) {
          doc.addPage();
          header();
        }
        drawRow(totalsOf(table), { bold: true });
      }
      if (table.rows.length === 0) {
        doc
          .moveDown()
          .font('Helvetica-Oblique')
          .fontSize(9)
          .fillColor('#6B7280')
          .text('Sin registros para los filtros elegidos.');
      }

      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        // Escribir bajo el margen inferior haría que pdfkit agregue una página en blanco
        doc.page.margins.bottom = 0;
        doc
          .font('Helvetica')
          .fontSize(7)
          .fillColor('#6B7280')
          .text(
            `Página ${i + 1} de ${range.count}`,
            MARGIN,
            doc.page.height - MARGIN + 6,
            { width: usable, align: 'right', lineBreak: false },
          );
      }
      doc.end();
    });
  }
}
