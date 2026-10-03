/**
 * Lector CSV (RFC 4180): comillas, comillas escapadas ("") y saltos de línea dentro de
 * comillas. Detecta el separador: Excel en español guarda con ";" y en inglés con ",".
 */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, ''); // BOM de Excel
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function detectDelimiter(text: string): ';' | ',' {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const count = (d: string) => firstLine.split(d).length - 1;
  return count(';') >= count(',') && count(';') > 0 ? ';' : ',';
}
