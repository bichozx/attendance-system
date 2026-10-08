'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Badge, Button, Dialog, Field, Input, Notice, Select } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { api, call, errorMessage } from '@/lib/api/client';
import { fortnightOf, PERIOD_STATUS, type Period } from './periods';
import { addDays, rangeLabel, todayIn } from './week';

type Action = { kind: 'publish' | 'close' | 'delete'; period: Period };

/**
 * Periodos que tocan la semana visible, con su estado y lo que se puede hacer con ellos.
 * Ciclo: Borrador (solo lo ve quien programa) → Publicado (lo ven los empleados) → Cerrado (congelado).
 */
export function PeriodsBar({
  periods,
  storeId,
  storeName,
  timeZone,
  from,
  to,
  canManage,
  canPublish,
  onGoTo,
}: {
  periods: Period[];
  storeId: string;
  storeName: string;
  timeZone: string;
  from: string;
  to: string;
  canManage: boolean;
  canPublish: boolean;
  onGoTo: (date: string) => void;
}) {
  const [action, setAction] = useState<Action | null>(null);
  const [creating, setCreating] = useState(false);
  const visible = periods.filter((p) => p.startDate <= to && p.endDate >= from).sort((a, b) => a.startDate.localeCompare(b.startDate));
  const upcoming = periods.filter((p) => p.startDate > to && p.status === 'DRAFT').sort((a, b) => a.startDate.localeCompare(b.startDate));
  const today = todayIn(timeZone);

  return (
    <section aria-label="Periodos de programación" className="mb-4 rounded-ui border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <h2 className="font-semibold">Periodos</h2>
        {canManage ? (
          <Button size="sm" variant="secondary" onClick={() => setCreating(true)}>
            Nuevo periodo
          </Button>
        ) : null}
      </div>
      {visible.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted">
          Esta semana no pertenece a ningún periodo: los turnos que crees aquí los verán los empleados de inmediato. Crea un periodo para programar en borrador y publicar todo de una vez.
        </p>
      ) : null}
      <ul className="divide-y divide-line">
        {[...visible, ...upcoming.slice(0, 2)].map((p) => {
          const status = PERIOD_STATUS[p.status] ?? { label: p.status, tone: 'neutral' as const };
          const ended = p.endDate < today;
          const isUpcoming = !visible.includes(p);
          return (
            <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2">
                  {isUpcoming ? (
                    <button className="font-semibold underline-offset-4 hover:underline" onClick={() => onGoTo(p.startDate)}>
                      {p.name}
                    </button>
                  ) : (
                    <span className="font-semibold">{p.name}</span>
                  )}
                  <Badge tone={status.tone}>{status.label}</Badge>
                  {isUpcoming ? <span className="text-sm text-muted">Próximo</span> : null}
                </p>
                <p className="text-sm text-muted">
                  {rangeLabel(p.startDate, p.endDate)} · {p.storeName ?? 'Todos los establecimientos'} · {p.shiftCount === 1 ? '1 turno' : `${p.shiftCount} turnos`}
                </p>
              </div>
              <div className="flex gap-2">
                {p.status === 'DRAFT' && canPublish ? (
                  <Button size="sm" disabled={p.shiftCount === 0} title={p.shiftCount === 0 ? 'Agrega turnos antes de publicar' : undefined} onClick={() => setAction({ kind: 'publish', period: p })}>
                    Publicar
                  </Button>
                ) : null}
                {p.status === 'DRAFT' && canManage ? (
                  <Button size="sm" variant="quiet" className="text-missing" onClick={() => setAction({ kind: 'delete', period: p })}>
                    Eliminar
                  </Button>
                ) : null}
                {p.status === 'PUBLISHED' && canPublish && ended ? (
                  <Button size="sm" variant="secondary" onClick={() => setAction({ kind: 'close', period: p })}>
                    Cerrar periodo
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      <Dialog open={!!action} onClose={() => setAction(null)} title={action ? TITLES[action.kind] : ''}>
        {action ? <ConfirmAction action={action} onDone={() => setAction(null)} /> : null}
      </Dialog>
      <Dialog open={creating} onClose={() => setCreating(false)} title="Nuevo periodo">
        <CreatePeriodForm storeId={storeId} storeName={storeName} periods={periods} suggestedFrom={from} onDone={() => setCreating(false)} onCreated={onGoTo} />
      </Dialog>
    </section>
  );
}

const TITLES = { publish: 'Publicar periodo', close: 'Cerrar periodo', delete: 'Eliminar borrador' };

function ConfirmAction({ action, onDone }: { action: Action; onDone: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { kind, period } = action;
  const run = useMutation({
    mutationFn: () => {
      const params = { params: { path: { id: period.id } } };
      if (kind === 'publish') return call(api.POST('/schedule-periods/{id}/publish', params));
      if (kind === 'close') return call(api.POST('/schedule-periods/{id}/close', params));
      return call(api.DELETE('/schedule-periods/{id}', params));
    },
    onSuccess: () => {
      toast(kind === 'publish' ? `${period.name} publicado` : kind === 'close' ? `${period.name} cerrado` : 'Borrador eliminado');
      void queryClient.invalidateQueries({ queryKey: ['periods'] });
      void queryClient.invalidateQueries({ queryKey: ['shifts'] });
      onDone();
    },
  });
  const text = {
    publish: `Los empleados empezarán a ver los ${period.shiftCount} turnos de "${period.name}" y recibirán una notificación. Después de publicar, cada cambio se le notifica a quien afecte.`,
    close: `"${period.name}" quedará congelado: no se podrán crear, cambiar ni cancelar sus turnos.`,
    delete: `Se eliminarán "${period.name}" y sus ${period.shiftCount} turnos. Nadie los ha visto todavía.`,
  }[kind];
  return (
    <div className="flex flex-col gap-4">
      {run.error ? <Notice tone="error" title={errorMessage(run.error)} /> : null}
      <p>{text}</p>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>
          Volver
        </Button>
        <Button variant={kind === 'delete' ? 'danger' : 'primary'} loading={run.isPending} onClick={() => run.mutate()}>
          {kind === 'publish' ? 'Publicar' : kind === 'close' ? 'Cerrar periodo' : 'Eliminar'}
        </Button>
      </div>
    </div>
  );
}

function CreatePeriodForm({
  storeId,
  storeName,
  periods,
  suggestedFrom,
  onDone,
  onCreated,
}: {
  storeId: string;
  storeName: string;
  periods: Period[];
  suggestedFrom: string;
  onDone: () => void;
  onCreated: (date: string) => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  // Sugerencia: la primera quincena desde la semana visible que no tenga periodo
  const suggestion = (() => {
    let f = fortnightOf(suggestedFrom);
    for (let i = 0; i < 6 && periods.some((p) => p.startDate <= f.endDate && p.endDate >= f.startDate && (p.storeId === storeId || p.storeId === null)); i++) {
      f = fortnightOf(addDays(f.endDate, 1));
    }
    return f;
  })();
  const [scope, setScope] = useState<'store' | 'company'>('store');
  const [startDate, setStart] = useState(suggestion.startDate);
  const [endDate, setEnd] = useState(suggestion.endDate);
  const [name, setName] = useState('');
  const create = useMutation({
    mutationFn: () =>
      call(api.POST('/schedule-periods', { body: { storeId: scope === 'store' ? storeId : null, startDate, endDate, ...(name.trim() ? { name: name.trim() } : {}) } })),
    onSuccess: (p) => {
      toast(`${p.name} creado en borrador`);
      void queryClient.invalidateQueries({ queryKey: ['periods'] });
      onDone();
      onCreated(p.startDate);
    },
  });
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate();
      }}>
      {create.error ? <Notice tone="error" title={errorMessage(create.error)} /> : null}
      <p className="text-sm text-muted">Los turnos de un periodo en borrador solo los ve quien programa. Al publicarlo, los empleados los ven y reciben un aviso.</p>
      <Field label="Aplica a">
        <Select value={scope} onChange={(e) => setScope(e.target.value as 'store' | 'company')}>
          <option value="store">Solo {storeName}</option>
          <option value="company">Todos los establecimientos</option>
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Desde">
          <Input type="date" required value={startDate} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="Hasta">
          <Input type="date" required min={startDate} value={endDate} onChange={(e) => setEnd(e.target.value)} />
        </Field>
      </div>
      <Field label="Nombre (opcional)" hint="Si lo dejas vacío se arma con las fechas.">
        <Input maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder={`Quincena ${rangeLabel(startDate, endDate)}`} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" loading={create.isPending}>
          Crear periodo
        </Button>
      </div>
    </form>
  );
}
