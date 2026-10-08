'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';

import { Empty, Notice, PageHeader, Select, Spinner } from '@/components/ui';
import { api, call, errorMessage } from '@/lib/api/client';
import { duration, longDate } from '@/lib/time';
import { DayTimeline } from './day-timeline';
import { STATUS, STATUS_ORDER, type LiveStatus } from './status';

export function DashboardView({ canFilterStores }: { canFilterStores: boolean }) {
  const [storeId, setStoreId] = useState('');
  const [filter, setFilter] = useState<LiveStatus | null>(null);

  const dashboard = useQuery({
    // Sin filtros comparte caché con el menú (pendientes por aprobar)
    queryKey: storeId ? ['dashboard', 'today', storeId] : ['dashboard', 'today'],
    queryFn: () => call(api.GET('/reports/dashboard', { params: { query: storeId ? { storeId } : {} } })),
    refetchInterval: 60_000,
  });
  const stores = useQuery({
    queryKey: ['stores', 'all'],
    queryFn: () => call(api.GET('/stores', { params: { query: { pageSize: 100 } } })),
    enabled: canFilterStores,
  });

  const d = dashboard.data;
  const people = (d?.people ?? []).filter((p) => !filter || p.status === filter);
  const pending = d ? d.pending.attendanceToReview + d.pending.incidentsToApprove + d.pending.shiftChangesToApprove : 0;
  const attention = d ? [...d.attention.missingClockIn, ...d.attention.pendingExit] : [];

  return (
    <>
      <PageHeader
        title="Hoy"
        description={d ? <span className="first-letter:uppercase">{longDate(d.date)}</span> : ' '}
        actions={
          canFilterStores && (stores.data?.items.length ?? 0) > 1 ? (
            <Select aria-label="Establecimiento" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
              <option value="">Todos los establecimientos</option>
              {stores.data!.items.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          ) : null
        }
      />

      {dashboard.isPending ? <Spinner /> : null}
      {dashboard.error ? <Notice tone="error" title="No se pudo cargar el día">{errorMessage(dashboard.error)}</Notice> : null}

      {d ? (
        <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_320px]">
          {/* min-w-0: sin esto el hijo de la cuadrícula no se encoge y la franja estira la página */}
          <section aria-labelledby="jornada" className="min-w-0">
            <h2 id="jornada" className="sr-only">
              Jornada
            </h2>
            {/* La leyenda es también el filtro: un clic muestra solo ese estado */}
            <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filtrar por estado">
              <LegendButton active={filter === null} onClick={() => setFilter(null)}>
                Todas las personas <strong>{d.totals.scheduled}</strong>
              </LegendButton>
              {STATUS_ORDER.filter((s) => d.totals[s] > 0).map((s) => (
                <LegendButton key={s} active={filter === s} onClick={() => setFilter(filter === s ? null : s)}>
                  <span className={`size-2.5 rounded-full ${STATUS[s].dot}`} aria-hidden />
                  {STATUS[s].label} <strong>{d.totals[s]}</strong>
                </LegendButton>
              ))}
              {d.totals.late > 0 ? (
                <span className="self-center px-1 text-sm text-muted">
                  {d.totals.late} {d.totals.late === 1 ? 'llegó tarde' : 'llegaron tarde'}
                </span>
              ) : null}
            </div>

            {d.totals.scheduled === 0 ? (
              <Empty title="No hay turnos programados para hoy">
                Cuando se publiquen turnos para este día, aquí verás quién está, quién falta y quién debe la salida.
              </Empty>
            ) : (
              <DayTimeline people={people} day={d.date} timeZone={d.timeZone} now={new Date(d.serverTime)} />
            )}
          </section>

          <aside className="flex flex-col gap-6">
            <section aria-labelledby="accion">
              <h2 id="accion" className="mb-2 text-lg font-bold">
                Requiere acción
              </h2>
              {attention.length === 0 ? (
                <p className="text-muted">Nadie sin marcar ni con salida pendiente.</p>
              ) : (
                <ul className="divide-y divide-line rounded-ui border border-line bg-surface">
                  {attention.map((p) => (
                    <li key={`${p.employeeId}-${p.status}`} className="flex gap-3 px-4 py-3">
                      <span className={`mt-1.5 size-2.5 shrink-0 rounded-full ${STATUS[p.status as LiveStatus].dot}`} aria-hidden />
                      <div>
                        <p className="font-semibold">{p.name}</p>
                        <p className="text-sm text-muted">
                          {p.status === 'MISSING'
                            ? `Sin marcar entrada hace ${duration(p.minutesOverdue ?? 0)}`
                            : `Debe la salida desde hace ${duration(p.minutesOverdue ?? 0)}`}
                          {' en '}
                          {p.storeName}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="pendientes">
              <h2 id="pendientes" className="mb-2 text-lg font-bold">
                Por aprobar
              </h2>
              {pending === 0 ? (
                <p className="text-muted">No hay nada pendiente.</p>
              ) : (
                <Link href="/aprobaciones" className="block rounded-ui border border-line bg-surface px-4 py-3 hover:border-ink">
                  <ul className="flex flex-col gap-1 text-[15px]">
                    {d.pending.attendanceToReview ? <li>{d.pending.attendanceToReview} marcaciones por revisar</li> : null}
                    {d.pending.incidentsToApprove ? <li>{d.pending.incidentsToApprove} novedades</li> : null}
                    {d.pending.shiftChangesToApprove ? <li>{d.pending.shiftChangesToApprove} cambios de turno</li> : null}
                  </ul>
                  <span className="mt-2 inline-block text-sm font-semibold underline underline-offset-4">Revisar</span>
                </Link>
              )}
            </section>
          </aside>
        </div>
      ) : null}
    </>
  );
}

function LegendButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm ${
        active ? 'border-ink bg-ink text-white' : 'border-line-strong bg-surface hover:border-ink'
      }`}>
      {children}
    </button>
  );
}
