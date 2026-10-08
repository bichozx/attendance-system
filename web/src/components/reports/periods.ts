/** Periodos de nómina en Colombia: quincenas del 1 al 15 y del 16 al último día. */
const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

export function fortnight(today: Date, offset = 0) {
  let y = today.getFullYear();
  let m = today.getMonth();
  let half = today.getDate() <= 15 ? 0 : 1;
  for (let i = 0; i < Math.abs(offset); i++) {
    if (offset < 0) {
      if (half === 1) half = 0;
      else {
        half = 1;
        m -= 1;
        if (m < 0) {
          m = 11;
          y -= 1;
        }
      }
    }
  }
  return half === 0 ? { from: iso(y, m, 1), to: iso(y, m, 15) } : { from: iso(y, m, 16), to: iso(y, m, lastDay(y, m)) };
}

export function month(today: Date) {
  const y = today.getFullYear();
  const m = today.getMonth();
  return { from: iso(y, m, 1), to: iso(y, m, lastDay(y, m)) };
}
