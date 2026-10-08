'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { Badge, Button, Field, Input, Notice, Spinner, Textarea } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { api, call, errorMessage, type Schemas } from '@/lib/api/client';
import { clock, duration } from '@/lib/time';
import { PeoplePicker } from './people-picker';
import { PERIOD_STATUS } from './periods';
import { explainShiftError } from './shift-errors';
import { weekdayLong } from './week';

type Shift = Schemas['ShiftResponseDto'];
type Employee = Schemas['EmployeeResponseDto'];

type Mode = 'view' | 'edit' | 'add' | 'cancel';

export function ShiftDetail({ shiftId, employees, canManage, onClose }: { shiftId: string; employees: Employee[]; canManage: boolean; onClose: () => void }) {
  const shift = useQuery({
    queryKey: ['shifts', 'detail', shiftId],
    queryFn: () => call(api.GET('/shifts/{id}', { params: { path: { id: shiftId } } })),
  });
  if (shift.isPending) return <Spinner />;
  if (shift.error) return <Notice tone="error" title="No se pudo cargar el turno">{errorMessage(shift.error)}</Notice>;
  return <ShiftBody shift={shift.data} employees={employees} canManage={canManage} onClose={onClose} />;
}

function ShiftBody({ shift, employees, canManage, onClose }: { shift: Shift; employees: Employee[]; canManage: boolean; onClose: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>('view');
  const [problems, setProblems] = useState<string[]>([]);
  const tz = shift.timeZone;
  const people = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const active = shift.assignments.filter((a) => a.status === 'ASSIGNED');

  const started = new Date(shift.startsAt) <= new Date();
  const cancelled = shift.status === 'CANCELLED';
  const frozen = shift.periodStatus === 'CLOSED';
  const editable = canManage && !cancelled && !started && !frozen;
  const notifies = shift.periodStatus === 'PUBLISHED';

  const refresh = (message: string) => {
    toast(message);
    setProblems([]);
    setMode('view');
    void queryClient.invalidateQueries({ queryKey: ['shifts'] });
    void queryClient.invalidateQueries({ queryKey: ['periods'] });
  };
  const fail = (e: unknown) => setProblems(explainShiftError(e, people, tz));

  const unassign = useMutation({
    mutationFn: (employeeId: string) => call(api.DELETE('/shifts/{id}/assignments/{employeeId}', { params: { path: { id: shift.id, employeeId } } })),
    onSuccess: () => refresh('Persona retirada del turno'),
    onError: fail,
  });

  const status = cancelled ? (
    <Badge tone="missing">Cancelado</Badge>
  ) : shift.periodStatus ? (
    <Badge tone={PERIOD_STATUS[shift.periodStatus]?.tone ?? 'neutral'}>{PERIOD_STATUS[shift.periodStatus]?.label ?? shift.periodStatus}</Badge>
  ) : (
    <Badge>Sin periodo</Badge>
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xl font-bold">
            {shift.local.startTime} – {shift.local.endTime}
            {shift.local.overnight ? <span className="text-base font-normal text-muted"> (día siguiente)</span> : null}
          </p>
          {status}
        </div>
        <p className="capitalize text-muted">
          {weekdayLong(shift.local.date)} · {shift.storeName}
        </p>
        <p className="mt-1 text-sm">
          {duration(shift.durationMinutes)} en total
          {shift.breakMinutes ? ` · ${shift.breakMinutes} min de descanso · ${duration(shift.scheduledWorkMinutes)} de trabajo` : ''}
        </p>
        {shift.notes ? <p className="mt-1 text-sm">Nota: {shift.notes}</p> : null}
      </div>

      {!cancelled ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-ui bg-paper px-4 py-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-muted">Marca desde</dt>
            <dd className="font-semibold">{clock(shift.clockWindow.clockInOpensAt, tz)}</dd>
          </div>
          <div>
            <dt className="text-muted">Tarde después de</dt>
            <dd className="font-semibold">{clock(shift.clockWindow.lateAfter, tz)}</dd>
          </div>
          <div>
            <dt className="text-muted">Entrada hasta</dt>
            <dd className="font-semibold">{clock(shift.clockWindow.clockInClosesAt, tz)}</dd>
          </div>
          <div>
            <dt className="text-muted">Salida hasta</dt>
            <dd className="font-semibold">{clock(shift.clockWindow.clockOutClosesAt, tz)}</dd>
          </div>
        </dl>
      ) : null}

      {problems.length ? (
        <Notice tone="error" title="No se pudo guardar">
          <ul className="list-disc pl-5">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Notice>
      ) : null}
      {canManage && !cancelled && (started || frozen) ? (
        <Notice tone="neutral" title={frozen ? 'El periodo está cerrado' : 'Este turno ya empezó'}>
          {frozen ? 'Sus turnos quedaron congelados.' : 'Su asistencia está en curso; los ajustes se hacen desde Aprobaciones.'}
        </Notice>
      ) : null}

      {mode === 'view' ? (
        <section aria-label="Personas">
          <h3 className="mb-1 font-semibold">Personas ({active.length})</h3>
          {active.length === 0 ? <p className="text-sm text-warn">Nadie asignado todavía.</p> : null}
          <ul className="divide-y divide-line">
            {active.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                <span>
                  {a.firstName} {a.lastName} <span className="text-sm text-muted">{a.employeeCode}</span>
                </span>
                {editable ? (
                  <Button size="sm" variant="secondary" loading={unassign.isPending && unassign.variables === a.employeeId} onClick={() => unassign.mutate(a.employeeId)}>
                    Retirar
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
          {editable ? (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
              <Button variant="secondary" onClick={() => setMode('add')}>
                Agregar personas
              </Button>
              <Button variant="secondary" onClick={() => setMode('edit')}>
                Cambiar horario
              </Button>
              <Button variant="quiet" className="text-missing sm:ml-auto" onClick={() => setMode('cancel')}>
                Cancelar turno
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}

      {mode === 'add' ? (
        <AddPeople shift={shift} employees={employees} exclude={active.map((a) => a.employeeId)} onBack={() => setMode('view')} onSaved={refresh} onError={fail} notifies={notifies} />
      ) : null}
      {mode === 'edit' ? <EditShift shift={shift} onBack={() => setMode('view')} onSaved={refresh} onError={fail} notifies={notifies && active.length > 0} /> : null}
      {mode === 'cancel' ? (
        <CancelShift
          shift={shift}
          people={active.length}
          notifies={notifies}
          onBack={() => setMode('view')}
          onSaved={() => {
            refresh('Turno cancelado');
            onClose();
          }}
          onError={fail}
        />
      ) : null}
    </div>
  );
}

function AddPeople({
  shift,
  employees,
  exclude,
  notifies,
  onBack,
  onSaved,
  onError,
}: {
  shift: Shift;
  employees: Employee[];
  exclude: string[];
  notifies: boolean;
  onBack: () => void;
  onSaved: (m: string) => void;
  onError: (e: unknown) => void;
}) {
  const [ids, setIds] = useState<string[]>([]);
  const assign = useMutation({
    mutationFn: () => call(api.POST('/shifts/{id}/assignments', { params: { path: { id: shift.id } }, body: { employeeIds: ids } })),
    onSuccess: () => onSaved(ids.length === 1 ? 'Persona agregada' : `${ids.length} personas agregadas`),
    onError,
  });
  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-semibold">Agregar personas</h3>
      <PeoplePicker employees={employees} storeId={shift.storeId} value={ids} onChange={setIds} exclude={exclude} />
      {notifies && ids.length ? <p className="text-sm text-muted">Cada persona recibirá una notificación con su turno.</p> : null}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onBack}>
          Volver
        </Button>
        <Button disabled={!ids.length} loading={assign.isPending} onClick={() => assign.mutate()}>
          Agregar
        </Button>
      </div>
    </div>
  );
}

function EditShift({ shift, notifies, onBack, onSaved, onError }: { shift: Shift; notifies: boolean; onBack: () => void; onSaved: (m: string) => void; onError: (e: unknown) => void }) {
  const [date, setDate] = useState(shift.local.date);
  const [start, setStart] = useState(shift.local.startTime);
  const [end, setEnd] = useState(shift.local.endTime);
  const [breakMinutes, setBreak] = useState(shift.breakMinutes);
  const [early, setEarly] = useState(shift.earlyClockInMinutes);
  const [late, setLate] = useState(shift.lateToleranceMinutes);
  const [notes, setNotes] = useState(shift.notes ?? '');
  const update = useMutation({
    mutationFn: () =>
      call(
        api.PATCH('/shifts/{id}', {
          params: { path: { id: shift.id } },
          body: { date, startTime: start, endTime: end, breakMinutes, earlyClockInMinutes: early, lateToleranceMinutes: late, notes: notes.trim() || null },
        }),
      ),
    onSuccess: () => onSaved('Turno actualizado'),
    onError,
  });
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        update.mutate();
      }}>
      <h3 className="font-semibold">Cambiar horario</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="Fecha">
          <Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Entrada">
          <Input type="time" required value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="Salida">
          <Input type="time" required value={end} onChange={(e) => setEnd(e.target.value)} />
        </Field>
        <Field label="Descanso (min)">
          <Input type="number" min={0} max={240} value={breakMinutes} onChange={(e) => setBreak(Number(e.target.value))} />
        </Field>
        <Field label="Marcar antes (min)" hint="Desde cuándo puede marcar">
          <Input type="number" min={0} max={120} value={early} onChange={(e) => setEarly(Number(e.target.value))} />
        </Field>
        <Field label="Tolerancia (min)" hint="Antes de contar tardanza">
          <Input type="number" min={0} max={60} value={late} onChange={(e) => setLate(Number(e.target.value))} />
        </Field>
      </div>
      <Field label="Notas">
        <Textarea rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      {notifies ? <p className="text-sm text-muted">Las personas del turno recibirán una notificación con el cambio.</p> : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onBack}>
          Volver
        </Button>
        <Button type="submit" loading={update.isPending}>
          Guardar cambios
        </Button>
      </div>
    </form>
  );
}

function CancelShift({
  shift,
  people,
  notifies,
  onBack,
  onSaved,
  onError,
}: {
  shift: Shift;
  people: number;
  notifies: boolean;
  onBack: () => void;
  onSaved: () => void;
  onError: (e: unknown) => void;
}) {
  const [reason, setReason] = useState('');
  const cancel = useMutation({
    mutationFn: () => call(api.POST('/shifts/{id}/cancel', { params: { path: { id: shift.id } }, body: { reason: reason.trim() || undefined } })),
    onSuccess: onSaved,
    onError,
  });
  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-semibold">Cancelar turno</h3>
      <p className="text-sm">
        El turno queda en el historial como cancelado.
        {notifies && people ? ` ${people === 1 ? 'La persona asignada recibirá' : `Las ${people} personas asignadas recibirán`} una notificación.` : ''}
      </p>
      <Field label="Motivo (opcional)" hint={notifies ? 'Se incluye en la notificación.' : undefined}>
        <Textarea rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onBack}>
          Volver
        </Button>
        <Button variant="danger" loading={cancel.isPending} onClick={() => cancel.mutate()}>
          Cancelar turno
        </Button>
      </div>
    </div>
  );
}
