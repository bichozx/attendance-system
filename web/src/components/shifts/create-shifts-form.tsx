'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { Badge, Button, Field, Input, Notice, Textarea } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { api, call, type Schemas } from '@/lib/api/client';
import { PeoplePicker } from './people-picker';
import { periodFor, PERIOD_STATUS, type Period } from './periods';
import { explainShiftError } from './shift-errors';
import { addDays, dayNumber, hours, rangeLabel, spanMinutes, weekdayShort, weekDays } from './week';

type Employee = Schemas['EmployeeResponseDto'];

const PRESETS = [
  { label: 'Mañana', start: '06:00', end: '14:00' },
  { label: 'Tarde', start: '14:00', end: '22:00' },
  { label: 'Noche', start: '22:00', end: '06:00' },
  { label: 'Completo', start: '08:00', end: '17:00' },
];

/**
 * Crea uno o varios turnos con el mismo horario: días de la semana visible y, si se quiere,
 * repetidos cada semana hasta una fecha. Cada periodo se envía en su propio lote (todo o nada).
 */
export function CreateShiftsForm({
  storeId,
  storeName,
  timeZone,
  monday,
  initialDate,
  periods,
  employees,
  onDone,
}: {
  storeId: string;
  storeName: string;
  timeZone: string;
  monday: string;
  initialDate: string;
  periods: Period[];
  employees: Employee[];
  onDone: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const days = weekDays(monday);
  const [selected, setSelected] = useState<string[]>([initialDate]);
  const [repeatUntil, setRepeatUntil] = useState('');
  const [start, setStart] = useState('08:00');
  const [end, setEnd] = useState('17:00');
  const [breakMinutes, setBreakMinutes] = useState('');
  const [notes, setNotes] = useState('');
  const [people, setPeople] = useState<string[]>([]);
  const [problems, setProblems] = useState<string[]>([]);

  const dates = useMemo(() => {
    const out: string[] = [];
    for (const d of [...selected].sort()) {
      for (let x = d; x === d || (repeatUntil && x <= repeatUntil); x = addDays(x, 7)) out.push(x);
    }
    return out.sort();
  }, [selected, repeatUntil]);

  // Agrupa por periodo (null = sin periodo, visible de inmediato)
  const groups = useMemo(() => {
    const map = new Map<string, { period: Period | null; dates: string[] }>();
    for (const d of dates) {
      const p = periodFor(periods, storeId, d);
      const key = p?.id ?? 'none';
      if (!map.has(key)) map.set(key, { period: p, dates: [] });
      map.get(key)!.dates.push(d);
    }
    return [...map.values()];
  }, [dates, periods, storeId]);

  const closed = groups.filter((g) => g.period?.status === 'CLOSED');
  // Periodo al que llevar la repetición: el del primer día marcado que pertenezca a uno
  const firstPeriod = [...selected].sort().map((d) => periodFor(periods, storeId, d)).find((p) => p && p.status !== 'CLOSED') ?? null;
  const minutes = start && end ? spanMinutes(start, end) : 0;
  const overnight = !!start && !!end && end <= start;
  const peopleById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);

  const save = useMutation({
    mutationFn: async () => {
      let created = 0;
      for (const g of groups) {
        const common = {
          startTime: start,
          endTime: end,
          ...(breakMinutes !== '' ? { breakMinutes: Number(breakMinutes) } : {}),
          notes: notes.trim() || null,
          employeeIds: people,
        };
        const res = await call(
          api.POST('/shifts/bulk', {
            body: { storeId, schedulePeriodId: g.period?.id ?? null, shifts: g.dates.map((date) => ({ date, ...common })) },
          }),
        );
        created += res.created;
      }
      return created;
    },
    onMutate: () => setProblems([]),
    onSuccess: (created) => {
      toast(created === 1 ? 'Turno creado' : `${created} turnos creados`);
      void queryClient.invalidateQueries({ queryKey: ['shifts'] });
      void queryClient.invalidateQueries({ queryKey: ['periods'] });
      onDone();
    },
    onError: (e) => {
      setProblems(explainShiftError(e, peopleById, timeZone));
      void queryClient.invalidateQueries({ queryKey: ['shifts'] });
    },
  });

  const toggleDay = (d: string) => setSelected(selected.includes(d) ? selected.filter((x) => x !== d) : [...selected, d]);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}>
      {problems.length ? (
        <Notice tone="error" title="No se creó ningún turno de este lote">
          <ul className="list-disc pl-5">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Notice>
      ) : null}

      <fieldset>
        <legend className="mb-1.5 text-sm font-semibold">Días · {storeName}</legend>
        <div className="grid grid-cols-7 gap-1">
          {days.map((d) => (
            <label
              key={d}
              className={`flex cursor-pointer flex-col items-center rounded-ui border py-1.5 text-sm has-focus-visible:outline-2 ${
                selected.includes(d) ? 'border-ink bg-ink text-white' : 'border-line hover:bg-paper'
              }`}>
              <input type="checkbox" className="sr-only" checked={selected.includes(d)} onChange={() => toggleDay(d)} />
              <span className="capitalize">{weekdayShort(d)}</span>
              <span className="font-bold">{dayNumber(d)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="repeat-until" className="text-sm font-semibold">
          Repetir cada semana hasta (opcional)
        </label>
        <div className="flex flex-wrap gap-2">
          <Input id="repeat-until" type="date" className="w-auto" min={addDays(monday, 7)} value={repeatUntil} onChange={(e) => setRepeatUntil(e.target.value)} />
          {firstPeriod && firstPeriod.endDate > addDays(monday, 6) ? (
            <Button type="button" variant="secondary" size="sm" onClick={() => setRepeatUntil(firstPeriod.endDate)}>
              Hasta el fin del periodo ({rangeLabel(firstPeriod.startDate, firstPeriod.endDate)})
            </Button>
          ) : null}
        </div>
        <span className="text-sm text-muted">Deja vacío para crear solo los días marcados.</span>
      </div>

      <div>
        <div className="mb-2 flex flex-wrap gap-1.5" role="group" aria-label="Horarios frecuentes">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                setStart(p.start);
                setEnd(p.end);
              }}
              className={`rounded-full border px-3 py-1 text-sm ${start === p.start && end === p.end ? 'border-ink bg-ink text-white' : 'border-line hover:bg-paper'}`}>
              {p.label} {p.start}–{p.end}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Entrada">
            <Input type="time" required value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="Salida">
            <Input type="time" required value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
          <Field label="Descanso (min)">
            <Input type="number" min={0} max={240} placeholder="Según empresa" value={breakMinutes} onChange={(e) => setBreakMinutes(e.target.value)} />
          </Field>
        </div>
        {minutes ? (
          <p className="mt-1 text-sm text-muted">
            Turno de {hours(minutes)}
            {overnight ? ' · termina al día siguiente' : ''}
          </p>
        ) : null}
      </div>

      <div>
        <p className="mb-1.5 text-sm font-semibold">Personas</p>
        <PeoplePicker employees={employees} storeId={storeId} value={people} onChange={setPeople} />
      </div>

      <Field label="Notas (opcional)">
        <Textarea rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ej: inventario de fin de mes" />
      </Field>

      {dates.length ? (
        <div className="rounded-ui bg-paper px-4 py-3 text-sm">
          <p className="font-semibold">
            {dates.length === 1 ? 'Se creará 1 turno' : `Se crearán ${dates.length} turnos`}
            {people.length ? ` con ${people.length === 1 ? '1 persona' : `${people.length} personas`}` : ' sin personas asignadas'}
          </p>
          <ul className="mt-1 flex flex-col gap-1">
            {groups.map((g) => (
              <li key={g.period?.id ?? 'none'} className="flex flex-wrap items-center gap-2">
                <span>{g.dates.length} en</span>
                {g.period ? (
                  <>
                    <span>{g.period.name}</span>
                    <Badge tone={PERIOD_STATUS[g.period.status]?.tone ?? 'neutral'}>{PERIOD_STATUS[g.period.status]?.label ?? g.period.status}</Badge>
                  </>
                ) : (
                  <span>ningún periodo: los empleados los verán de inmediato</span>
                )}
              </li>
            ))}
          </ul>
          {groups.some((g) => g.period?.status === 'PUBLISHED') ? <p className="mt-1 text-muted">El periodo ya está publicado: cada persona recibirá una notificación.</p> : null}
        </div>
      ) : null}
      {closed.length ? <Notice tone="error" title={`${closed[0].period!.name} está cerrado; no admite turnos nuevos`} /> : null}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" loading={save.isPending} disabled={!dates.length || !!closed.length || dates.length > 300}>
          {dates.length > 1 ? `Crear ${dates.length} turnos` : 'Crear turno'}
        </Button>
      </div>
    </form>
  );
}
