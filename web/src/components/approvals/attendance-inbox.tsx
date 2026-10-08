'use client';

import { useMutation, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useState } from 'react';

import { Badge, Button, Dialog, Empty, Field, Input, Notice, Spinner, Textarea } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { api, call, errorMessage, type Schemas } from '@/lib/api/client';
import { ATTENDANCE_STATUS, REVIEW_REASON } from '@/lib/labels';
import { clock, duration, localParts, shortDate, zonedToIso } from '@/lib/time';

type Attendance = Schemas['AttendanceResponseDto'];
type Page = { items: Attendance[]; total: number };

export function AttendanceInbox({ query }: { query: UseQueryResult<Page> }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<Attendance | null>(null);

  const done = (message: string) => {
    toast(message);
    void queryClient.invalidateQueries({ queryKey: ['approvals'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };
  const review = useMutation({
    mutationFn: (id: string) => call(api.POST('/attendance/{id}/review', { params: { path: { id } }, body: {} })),
    onSuccess: (a) => done(`Revisada la marcación de ${a.employee.firstName}`),
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  if (query.isPending) return <Spinner />;
  if (query.error) return <Notice tone="error" title="No se pudieron cargar las marcaciones">{errorMessage(query.error)}</Notice>;
  if (!query.data?.items.length) {
    return <Empty title="Nada por revisar">Aquí llegan las marcaciones con algo inusual: hechas sin señal, con el reloj del teléfono desfasado o sin salida.</Empty>;
  }

  return (
    <>
      <ul className="divide-y divide-line rounded-ui border border-line bg-surface">
        {query.data.items.map((a) => {
          const tz = a.shift.timeZone;
          return (
            <li key={a.id} className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
              <div>
                <p className="font-semibold">
                  {a.employee.firstName} {a.employee.lastName}
                  <span className="font-normal text-muted">
                    {' '}
                    · {shortDate(a.workDate)} · {a.shift.storeName}
                  </span>
                </p>
                <p className="text-[15px]">
                  Turno {a.shift.localStart}–{a.shift.localEnd} · entró {a.clockInAt ? clock(a.clockInAt, tz) : '—'} · salió{' '}
                  {a.clockOutAt ? clock(a.clockOutAt, tz) : '—'}
                  {a.lateMinutes ? <span className="text-[#94650a]"> · {duration(a.lateMinutes)} tarde</span> : null}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge tone={a.status === 'COMPLETED' ? 'done' : a.status === 'INCOMPLETE' ? 'warn' : 'neutral'}>{ATTENDANCE_STATUS[a.status] ?? a.status}</Badge>
                  {a.reviewReasons.map((r) => (
                    <Badge key={r} tone="warn">
                      {REVIEW_REASON[r] ?? r}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" loading={review.isPending && review.variables === a.id} onClick={() => review.mutate(a.id)}>
                  Está bien
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setEditing(a)}>
                  Corregir horas
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      <Dialog open={!!editing} onClose={() => setEditing(null)} title="Corregir horas">
        {editing ? (
          <AdjustForm
            attendance={editing}
            onDone={(name) => {
              setEditing(null);
              done(`Corregida la marcación de ${name}`);
            }}
            onCancel={() => setEditing(null)}
          />
        ) : null}
      </Dialog>
    </>
  );
}

function AdjustForm({ attendance: a, onDone, onCancel }: { attendance: Attendance; onDone: (name: string) => void; onCancel: () => void }) {
  const tz = a.shift.timeZone;
  const initial = (iso: string | null) => (iso ? localParts(iso, tz) : null);
  const inP = initial(a.clockInAt);
  const outP = initial(a.clockOutAt);
  const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const [inDate, setInDate] = useState(inP?.date ?? a.workDate);
  const [inTime, setInTime] = useState(inP ? hhmm(inP.minutes) : a.shift.localStart);
  const [outDate, setOutDate] = useState(outP?.date ?? a.workDate);
  const [outTime, setOutTime] = useState(outP ? hhmm(outP.minutes) : a.shift.localEnd);
  const [reason, setReason] = useState('');

  const save = useMutation({
    mutationFn: () =>
      call(
        api.POST('/attendance/{id}/adjust', {
          params: { path: { id: a.id } },
          body: {
            clockInAt: zonedToIso(inDate, inTime, tz),
            clockOutAt: zonedToIso(outDate, outTime, tz),
            reason: reason.trim(),
          },
        }),
      ),
    onSuccess: () => onDone(a.employee.firstName),
  });

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}>
      <p>
        {a.employee.firstName} {a.employee.lastName} · turno {a.shift.localStart}–{a.shift.localEnd} en {a.shift.storeName}. Horas en la
        zona del establecimiento.
      </p>
      {save.error ? <Notice tone="error" title={errorMessage(save.error)} /> : null}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Fecha de entrada">
          <Input type="date" required value={inDate} onChange={(e) => setInDate(e.target.value)} />
        </Field>
        <Field label="Hora de entrada">
          <Input type="time" required value={inTime} onChange={(e) => setInTime(e.target.value)} />
        </Field>
        <Field label="Fecha de salida">
          <Input type="date" required value={outDate} onChange={(e) => setOutDate(e.target.value)} />
        </Field>
        <Field label="Hora de salida">
          <Input type="time" required value={outTime} onChange={(e) => setOutTime(e.target.value)} />
        </Field>
      </div>
      <Field label="Motivo de la corrección" hint="Queda en el historial de la marcación.">
        <Textarea required minLength={5} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" loading={save.isPending}>
          Guardar corrección
        </Button>
      </div>
    </form>
  );
}
