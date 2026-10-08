'use client';

import { useEffect, useRef } from 'react';

import type { Schemas } from '@/lib/api/client';
import { clock, minuteOfDay } from '@/lib/time';
import { STATUS, type LiveStatus } from './status';

type Person = Schemas['DashboardPersonDto'];

const HOURS = [0, 3, 6, 9, 12, 15, 18, 21, 24];
const pct = (minutes: number) => `${(minutes / 1440) * 100}%`;

/**
 * La jornada de un vistazo: cada persona es una barra del color de su estado.
 * La línea vertical es "ahora"; la marca blanca, la hora en que marcó entrada.
 */
export function DayTimeline({ people, day, timeZone, now }: { people: Person[]; day: string; timeZone: string; now: Date | null }) {
  const nowMin = now ? minuteOfDay(now, timeZone, day) : null;
  const showNow = nowMin !== null && nowMin > 0 && nowMin < 1440;

  // En pantallas angostas, abrir la franja ubicada en "ahora" (no en la madrugada)
  const scroller = useRef<HTMLDivElement>(null);
  const centered = useRef(false);
  useEffect(() => {
    const el = scroller.current;
    if (!el || centered.current || !showNow || el.scrollWidth <= el.clientWidth) return;
    centered.current = true;
    const nameColumn = 160;
    const track = el.scrollWidth - nameColumn;
    el.scrollLeft = Math.max(0, nameColumn + (nowMin! / 1440) * track - el.clientWidth * 0.6);
  }, [showNow, nowMin]);

  return (
    // En pantallas angostas la franja se desplaza dentro de su recuadro (no estira la página)
    <div ref={scroller} className="overflow-x-auto rounded-ui border border-line bg-surface">
    <div className="min-w-[680px]" role="table" aria-label="Turnos del día">
      {/* Regla de horas */}
      <div className="grid grid-cols-[minmax(140px,220px)_1fr] border-b border-line" role="row">
        <div className="px-4 py-2 text-sm font-semibold text-muted" role="columnheader">
          Persona
        </div>
        <div className="relative mr-4 h-9" role="columnheader" aria-label="Horas del día">
          {HOURS.slice(0, -1)
            // La hora que quede bajo la etiqueta de "ahora" se oculta para no encimarse
            .filter((h) => !showNow || Math.abs(h * 60 - nowMin!) > 50)
            .map((h) => (
              <span key={h} className="absolute top-2 -translate-x-1/2 text-xs text-muted" style={{ left: pct(h * 60) }}>
                {h}
              </span>
            ))}
          {showNow ? (
            <span
              className="absolute top-1.5 -translate-x-1/2 rounded bg-ink px-1.5 py-0.5 text-xs font-bold text-white"
              style={{ left: pct(nowMin!) }}>
              {String(Math.floor(nowMin! / 60)).padStart(2, '0')}:{String(nowMin! % 60).padStart(2, '0')}
            </span>
          ) : null}
        </div>
      </div>

      <div>
        {people.map((p) => {
          const status = p.status as LiveStatus;
          const start = minuteOfDay(p.startsAt, timeZone, day);
          const end = minuteOfDay(p.endsAt, timeZone, day);
          const clockIn = p.clockInAt ? minuteOfDay(p.clockInAt, timeZone, day) : null;
          const label = `${p.name}, ${p.shiftStart} a ${p.shiftEnd}, ${STATUS[status].label}`;
          return (
            <div key={`${p.employeeId}-${p.startsAt}`} className="grid grid-cols-[minmax(140px,220px)_1fr] border-b border-line last:border-b-0" role="row">
              <div className="px-4 py-2.5" role="cell">
                <p className="truncate font-semibold">{p.name}</p>
                <p className="truncate text-sm text-muted">{p.storeName}</p>
              </div>
              <div className="relative mr-4" role="cell" aria-label={label} title={label}>
                {HOURS.slice(1, -1).map((h) => (
                  <span key={h} className="absolute inset-y-0 border-l border-line/70" style={{ left: pct(h * 60) }} />
                ))}
                <div
                  className={`absolute top-1/2 h-6 -translate-y-1/2 rounded-full ${STATUS[status].bar}`}
                  style={{ left: pct(start), width: `max(8px, ${pct(end - start)})` }}>
                  <span className={`absolute inset-0 flex items-center px-2.5 text-xs font-semibold whitespace-nowrap ${status === 'UPCOMING' ? 'text-muted' : 'text-white'}`}>
                    {end - start > 150 ? `${p.shiftStart}–${p.shiftEnd}` : ''}
                  </span>
                </div>
                {showNow ? <span className="absolute inset-y-0 z-10 w-px bg-ink" style={{ left: pct(nowMin!) }} aria-hidden /> : null}
                {clockIn !== null ? (
                  <span
                    className="absolute top-1/2 h-8 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink ring-2 ring-white"
                    style={{ left: pct(clockIn) }}
                    title={`Marcó entrada a las ${clock(p.clockInAt!, timeZone)}`}
                  />
                ) : null}
              </div>
            </div>
          );
        })}

      </div>
    </div>
    </div>
  );
}
