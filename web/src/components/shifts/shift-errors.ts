import { ApiError, errorMessage } from '@/lib/api/client';
import { clock } from '@/lib/time';
import { weekdayShort, dayNumber } from './week';

export interface PersonRef {
  id: string;
  firstName: string;
  lastName: string;
}

const UNAVAILABLE: Record<string, string> = {
  NOT_FOUND: 'no existe',
  NOT_ACTIVE: 'no está activo',
  NOT_HIRED_YET: 'aún no ha ingresado a la empresa en esa fecha',
  TERMINATED: 'ya fue retirado',
  ON_TIME_OFF: 'tiene una incapacidad o permiso aprobado en ese horario',
};

/** Sin repetidos y como máximo 6 frases (un lote de 300 turnos puede traer muchos cruces). */
function cap(lines: string[]) {
  const unique = [...new Set(lines)];
  return unique.length > 6 ? [...unique.slice(0, 5), `…y ${unique.length - 5} cruces más.`] : unique;
}

const fullName = (p?: PersonRef) => (p ? `${p.firstName} ${p.lastName}` : 'Un empleado');

/**
 * Convierte los errores de programación en frases que nombran a la persona y el turno
 * con el que choca, en vez de mostrar identificadores.
 */
export function explainShiftError(e: unknown, people: Map<string, PersonRef>, timeZone: string): string[] {
  if (!(e instanceof ApiError)) return [errorMessage(e)];
  if (e.code === 'SCHEDULE_CONFLICT') {
    const conflicts = (e.details?.conflicts ?? []) as { employeeId: string; startsAt: string; endsAt: string; conflictingShiftId: string | null }[];
    return cap(conflicts.map((c) => {
      const day = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(c.startsAt));
      const when = `${weekdayShort(day)} ${dayNumber(day)}, ${clock(c.startsAt, timeZone)}–${clock(c.endsAt, timeZone)}`;
      return c.conflictingShiftId
        ? `${fullName(people.get(c.employeeId))} ya tiene un turno que se cruza con el del ${when}.`
        : `${fullName(people.get(c.employeeId))} quedaría con dos turnos cruzados en este mismo lote (${when}).`;
    }));
  }
  if (e.code === 'EMPLOYEES_NOT_AVAILABLE') {
    const list = (e.details?.unavailable ?? []) as { employeeId: string; reason: string }[];
    return cap(list.map((u) => `${fullName(people.get(u.employeeId))} ${UNAVAILABLE[u.reason] ?? 'no está disponible'}.`));
  }
  if (e.code === 'SHIFT_ALREADY_STARTED') return ['Ese turno ya empezó o ya pasó; su asistencia está en curso y no se puede modificar.'];
  if (e.code === 'STORE_INACTIVE') return ['El establecimiento está inactivo. Actívalo antes de programar turnos.'];
  return [e.message];
}
