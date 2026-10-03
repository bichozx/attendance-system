import {
  addDays,
  localToUtc,
  utcToLocal,
} from '../../../shared/domain/zoned-time';

/** Horario tal como lo escribe el admin, en hora local del establecimiento. */
export interface LocalShiftTime {
  date: string; // "2026-10-16"
  startTime: string; // "14:00"
  endTime: string; // "22:00"; si es <= startTime, termina al día siguiente
}

export function toUtcRange(t: LocalShiftTime, timeZone: string) {
  const endDate = t.endTime <= t.startTime ? addDays(t.date, 1) : t.date;
  return {
    startsAt: localToUtc(t.date, t.startTime, timeZone),
    endsAt: localToUtc(endDate, t.endTime, timeZone),
  };
}

export function toLocalShiftTime(
  startsAt: Date,
  endsAt: Date,
  timeZone: string,
): LocalShiftTime {
  const start = utcToLocal(startsAt, timeZone);
  return {
    date: start.date,
    startTime: start.time,
    endTime: utcToLocal(endsAt, timeZone).time,
  };
}

/** "vie, 16 de oct" */
export function describeDay(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('es-CO', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
    .format(at)
    .replace(/\./g, '');
}

/** "vie, 16 de oct, 14:00–22:00" para mensajes al empleado. */
export function describeShift(
  startsAt: Date,
  endsAt: Date,
  timeZone: string,
): string {
  const t = toLocalShiftTime(startsAt, endsAt, timeZone);
  return `${describeDay(startsAt, timeZone)}, ${t.startTime}–${t.endTime}`;
}
