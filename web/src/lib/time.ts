// /** Fecha y minuto del día de un instante, en la zona horaria de la empresa. */
// export function localParts(value: Date | string, timeZone: string) {
//   const p = Object.fromEntries(
//     new Intl.DateTimeFormat('en-CA', {
//       timeZone,
//       hourCycle: 'h23',
//       year: 'numeric',
//       month: '2-digit',
//       day: '2-digit',
//       hour: '2-digit',
//       minute: '2-digit',
//     })
//       .formatToParts(new Date(value))
//       .map((x) => [x.type, x.value]),
//   );
//   return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
// }

// /** Posición (0–1440) de un instante dentro del día `day`; lo de otros días se recorta al borde. */
// export function minuteOfDay(value: Date | string, timeZone: string, day: string): number {
//   const { date, minutes } = localParts(value, timeZone);
//   if (date < day) return 0;
//   if (date > day) return 1440;
//   return minutes;
// }

// export function longDate(day: string) {
//   return new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(
//     new Date(`${day}T12:00:00Z`),
//   );
// }

// export function clock(value: Date | string, timeZone: string) {
//   const { minutes } = localParts(value, timeZone);
//   return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
// }

// /** 95 → "1 h 35 min" */
// export function duration(minutes: number) {
//   if (minutes < 60) return `${minutes} min`;
//   const h = Math.floor(minutes / 60);
//   const m = minutes % 60;
//   return m ? `${h} h ${m} min` : `${h} h`;
// }

// /**
//  * "2026-10-16" + "14:05" en la zona `timeZone` → instante ISO (UTC).
//  * No depende de la zona horaria del computador de quien usa el panel.
//  */
// export function zonedToIso(date: string, time: string, timeZone: string): string {
//   const [y, mo, d] = date.split('-').map(Number);
//   const [h, mi] = time.split(':').map(Number);
//   const asUtc = Date.UTC(y, mo - 1, d, h, mi);
//   // Desfase de la zona en ese momento (dos pasadas cubren cambios de horario)
//   let guess = asUtc;
//   for (let i = 0; i < 2; i++) {
//     const p = localParts(new Date(guess), timeZone);
//     const shown = Date.UTC(
//       Number(p.date.slice(0, 4)),
//       Number(p.date.slice(5, 7)) - 1,
//       Number(p.date.slice(8, 10)),
//       Math.floor(p.minutes / 60),
//       p.minutes % 60,
//     );
//     guess += asUtc - shown;
//   }
//   return new Date(guess).toISOString();
// }

// export function shortDate(day: string) {
//   return new Intl.DateTimeFormat('es-CO', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
//     new Date(`${day}T12:00:00Z`),
//   );
// }

/**
 * Valida y convierte cualquier entrada a un objeto Date válido.
 * Retorna null si la entrada es undefined, null, vacía o no se puede parsear.
 */
export function toValidDate(
  value: Date | string | number | null | undefined,
): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/** Fecha y minuto del día de un instante, en la zona horaria de la empresa. */
export function localParts(
  value: Date | string | null | undefined,
  timeZone?: string,
) {
  const dateObj = toValidDate(value);

  // Fallback si la fecha es inválida/nula
  if (!dateObj) {
    return { date: '1970-01-01', minutes: 0, isValid: false };
  }

  // Fallback si timeZone es inválido o no se proporciona
  const validTimeZone = timeZone || 'America/Bogota'; // Ajusta la zona por defecto según tu negocio

  try {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: validTimeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
        .formatToParts(dateObj)
        .map((x) => [x.type, x.value]),
    );

    const hour = Number(p.hour ?? 0);
    const minute = Number(p.minute ?? 0);

    return {
      date: `${p.year}-${p.month}-${p.day}`,
      minutes: hour * 60 + minute,
      isValid: true,
    };
  } catch (err) {
    console.error(
      `[time.ts] Error procesando zona horaria "${validTimeZone}":`,
      err,
    );
    return { date: '1970-01-01', minutes: 0, isValid: false };
  }
}

/** Posición (0–1440) de un instante dentro del día `day`; lo de otros días se recorta al borde. */
export function minuteOfDay(
  value: Date | string | null | undefined,
  timeZone: string,
  day: string,
): number {
  const { date, minutes, isValid } = localParts(value, timeZone);
  if (!isValid) return 0;
  if (date < day) return 0;
  if (date > day) return 1440;
  return minutes;
}

export function longDate(day: string) {
  const dateObj = toValidDate(`${day}T12:00:00Z`);
  if (!dateObj) return day;

  return new Intl.DateTimeFormat('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(dateObj);
}

export function clock(
  value: Date | string | null | undefined,
  timeZone: string,
) {
  const { minutes, isValid } = localParts(value, timeZone);
  if (!isValid) return '--:--';
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** 95 → "1 h 35 min" */
export function duration(minutes: number) {
  if (isNaN(minutes) || minutes <= 0) return '0 min';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/**
 * "2026-10-16" + "14:05" en la zona `timeZone` → instante ISO (UTC).
 * No depende de la zona horaria del computador de quien usa el panel.
 */
export function zonedToIso(
  date: string,
  time: string,
  timeZone: string,
): string {
  if (!date || !time) return new Date().toISOString();

  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);

  if (isNaN(y) || isNaN(mo) || isNaN(d) || isNaN(h) || isNaN(mi)) {
    return new Date().toISOString();
  }

  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  let guess = asUtc;

  for (let i = 0; i < 2; i++) {
    const p = localParts(new Date(guess), timeZone);
    if (!p.isValid) break;

    const shown = Date.UTC(
      Number(p.date.slice(0, 4)),
      Number(p.date.slice(5, 7)) - 1,
      Number(p.date.slice(8, 10)),
      Math.floor(p.minutes / 60),
      p.minutes % 60,
    );
    guess += asUtc - shown;
  }
  return new Date(guess).toISOString();
}

export function shortDate(day: string) {
  const dateObj = toValidDate(`${day}T12:00:00Z`);
  if (!dateObj) return day;

  return new Intl.DateTimeFormat('es-CO', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(dateObj);
}
