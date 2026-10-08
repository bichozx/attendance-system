'use client';

import { useQuery } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { Button, Dialog, Empty, Notice, PageHeader, Select, Spinner } from '@/components/ui';
import { api, call, errorMessage, type Schemas } from '@/lib/api/client';
import { CreateShiftsForm } from './create-shifts-form';
import { PeriodsBar } from './periods-section';
import { periodFor } from './periods';
import { ShiftDetail } from './shift-detail';
import { addDays, dayNumber, hours, mondayOf, rangeLabel, todayIn, weekDays, weekdayShort } from './week';

type Shift = Schemas['ShiftResponseDto'];

export function ShiftsView({ canManage, canPublish }: { canManage: boolean; canPublish: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [creatingOn, setCreatingOn] = useState<string | null>(null);
  const [openShift, setOpenShift] = useState<string | null>(null);
  const [showCancelled, setShowCancelled] = useState(false);

  const stores = useQuery({
    queryKey: ['stores', 'all'],
    queryFn: () => call(api.GET('/stores', { params: { query: { pageSize: 100 } } })),
  });
  const activeStores = (stores.data?.items ?? []).filter((s) => s.isActive);
  const store = activeStores.find((s) => s.id === params.get('sede')) ?? activeStores[0];
  const timeZone = store?.timezone ?? 'America/Bogota';
  const today = todayIn(timeZone);
  const weekParam = params.get('semana');
  const monday = mondayOf(weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam) ? weekParam : today);
  const sunday = addDays(monday, 6);
  const days = weekDays(monday);

  const navigate = (next: { sede?: string; semana?: string }) => {
    const q = new URLSearchParams(params.toString());
    if (next.sede) q.set('sede', next.sede);
    if (next.semana) q.set('semana', mondayOf(next.semana));
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  };

  const shifts = useQuery({
    queryKey: ['shifts', 'week', store?.id, monday, showCancelled],
    queryFn: () =>
      call(api.GET('/shifts', { params: { query: { storeId: store!.id, from: monday, to: sunday, ...(showCancelled ? {} : { status: 'SCHEDULED' as const }) } } })),
    enabled: !!store,
  });
  const periods = useQuery({
    queryKey: ['periods', store?.id],
    queryFn: () => call(api.GET('/schedule-periods', { params: { query: { storeId: store!.id, pageSize: 100 } } })),
    enabled: !!store,
  });
  // Empleados activos para asignar (y para nombrar a quien tenga un cruce)
  const employees = useQuery({
    queryKey: ['employees', 'active-all'],
    queryFn: () => call(api.GET('/employees', { params: { query: { status: 'ACTIVE', pageSize: 100 } } })),
    enabled: canManage,
  });

  const byDay = new Map<string, Shift[]>(days.map((d) => [d, []]));
  for (const s of shifts.data ?? []) byDay.get(s.local.date)?.push(s);
  for (const list of byDay.values()) list.sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  const scheduled = (shifts.data ?? []).filter((s) => s.status === 'SCHEDULED');
  const totalMinutes = scheduled.reduce((sum, s) => sum + s.scheduledWorkMinutes * s.assignments.filter((a) => a.status === 'ASSIGNED').length, 0);
  const empty = scheduled.filter((s) => !s.assignments.some((a) => a.status === 'ASSIGNED')).length;
  const periodList = periods.data?.items ?? [];

  if (stores.isPending) return <Spinner />;
  if (stores.error) return <Notice tone="error" title="No se pudo cargar">{errorMessage(stores.error)}</Notice>;
  if (!store)
    return (
      <>
        <PageHeader title="Turnos" />
        <Empty title="No hay establecimientos activos">Crea un establecimiento antes de programar turnos.</Empty>
      </>
    );

  return (
    <>
      <PageHeader
        title="Turnos"
        description="Programación semanal por establecimiento."
        actions={canManage ? <Button onClick={() => setCreatingOn(days.includes(today) ? today : monday)}>Nuevo turno</Button> : null}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select aria-label="Establecimiento" className="min-w-48" value={store.id} onChange={(e) => navigate({ sede: e.target.value })}>
          {activeStores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <div className="flex items-center gap-1">
          <Button variant="secondary" size="sm" aria-label="Semana anterior" onClick={() => navigate({ semana: addDays(monday, -7) })}>
            ←
          </Button>
          <p className="min-w-44 text-center font-semibold" aria-live="polite">
            {rangeLabel(monday, sunday)}
          </p>
          <Button variant="secondary" size="sm" aria-label="Semana siguiente" onClick={() => navigate({ semana: addDays(monday, 7) })}>
            →
          </Button>
          {!days.includes(today) ? (
            <Button variant="quiet" size="sm" onClick={() => navigate({ semana: today })}>
              Hoy
            </Button>
          ) : null}
        </div>
        <label className="flex items-center gap-2 text-sm sm:ml-auto">
          <input type="checkbox" className="size-4 accent-ink" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} />
          Mostrar cancelados
        </label>
      </div>

      {periods.data ? (
        <PeriodsBar
          periods={periodList}
          storeId={store.id}
          storeName={store.name}
          timeZone={timeZone}
          from={monday}
          to={sunday}
          canManage={canManage}
          canPublish={canPublish}
          onGoTo={(d) => navigate({ semana: d })}
        />
      ) : null}

      {shifts.error ? <Notice tone="error" title="No se pudieron cargar los turnos">{errorMessage(shifts.error)}</Notice> : null}

      {shifts.data ? (
        <p className="mb-2 text-sm text-muted">
          {scheduled.length === 1 ? '1 turno' : `${scheduled.length} turnos`} · {hours(totalMinutes)} de trabajo programado
          {empty ? <span className="font-semibold text-warn"> · {empty === 1 ? '1 turno sin personas' : `${empty} turnos sin personas`}</span> : null}
        </p>
      ) : null}

      <div className="grid gap-2 md:grid-cols-7" aria-busy={shifts.isFetching}>
        {days.map((d) => {
          const list = byDay.get(d) ?? [];
          const period = periodFor(periodList, store.id, d);
          const locked = period?.status === 'CLOSED';
          return (
            <section key={d} aria-label={`${weekdayShort(d)} ${dayNumber(d)}`} className={`flex min-h-32 flex-col rounded-ui border bg-surface ${d === today ? 'border-ink' : 'border-line'}`}>
              <header className={`flex items-baseline justify-between px-2.5 py-1.5 ${d === today ? 'bg-ink text-white' : 'border-b border-line'}`}>
                <span className="capitalize">
                  {weekdayShort(d)} <span className="font-bold">{dayNumber(d)}</span>
                </span>
                {period?.status === 'DRAFT' ? <span className={`text-xs ${d === today ? '' : 'text-warn'}`}>Borrador</span> : null}
              </header>
              <ul className="flex flex-1 flex-col gap-1.5 p-1.5">
                {list.map((s) => (
                  <li key={s.id}>
                    <ShiftCard shift={s} onOpen={() => setOpenShift(s.id)} />
                  </li>
                ))}
                {list.length === 0 && shifts.data ? <li className="px-1 py-1 text-sm text-upcoming md:hidden">Sin turnos</li> : null}
              </ul>
              {canManage && !locked && d >= today ? (
                <button
                  onClick={() => setCreatingOn(d)}
                  className="m-1.5 mt-0 rounded-ui border border-dashed border-line-strong py-1 text-sm text-muted hover:border-ink hover:text-ink"
                  aria-label={`Agregar turno el ${weekdayShort(d)} ${dayNumber(d)}`}>
                  + Turno
                </button>
              ) : null}
            </section>
          );
        })}
      </div>

      <Dialog open={!!creatingOn} onClose={() => setCreatingOn(null)} title="Nuevo turno">
        {creatingOn ? (
          employees.data ? (
            <CreateShiftsForm
              storeId={store.id}
              storeName={store.name}
              timeZone={timeZone}
              monday={monday}
              initialDate={creatingOn}
              periods={periodList}
              employees={employees.data.items}
              onDone={() => setCreatingOn(null)}
            />
          ) : (
            <Spinner />
          )
        ) : null}
      </Dialog>
      <Dialog open={!!openShift} onClose={() => setOpenShift(null)} title="Turno">
        {openShift ? <ShiftDetail shiftId={openShift} employees={employees.data?.items ?? []} canManage={canManage} onClose={() => setOpenShift(null)} /> : null}
      </Dialog>
    </>
  );
}

function ShiftCard({ shift, onOpen }: { shift: Shift; onOpen: () => void }) {
  const people = shift.assignments.filter((a) => a.status === 'ASSIGNED');
  const cancelled = shift.status === 'CANCELLED';
  const draft = shift.periodStatus === 'DRAFT';
  return (
    <button
      onClick={onOpen}
      className={`w-full rounded-[6px] border-l-4 px-2 py-1.5 text-left text-sm hover:brightness-95 ${
        cancelled ? 'border-upcoming bg-paper text-muted line-through' : draft ? 'border-dashed border-warn bg-warn/10' : people.length === 0 ? 'border-warn bg-paper' : 'border-working bg-working/10'
      }`}>
      <span className="block font-bold">
        {shift.local.startTime}–{shift.local.endTime}
        {shift.local.overnight ? <span className="font-normal"> +1</span> : null}
      </span>
      {people.length ? (
        <span className="block leading-snug">{people.map((p) => `${p.firstName} ${p.lastName.charAt(0)}.`).join(', ')}</span>
      ) : (
        <span className="block font-semibold text-warn">Sin personas</span>
      )}
    </button>
  );
}
