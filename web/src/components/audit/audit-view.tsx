'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';

import { addDays, todayIn } from '@/components/shifts/week';
import { Button, Empty, Field, Input, Notice, PageHeader, Select, Spinner } from '@/components/ui';
import { api, call, errorMessage, type Schemas } from '@/lib/api/client';
import { ACTION_LABEL, CATEGORIES, ENTITY_LINK, FIELD_LABEL, HIDDEN_FIELDS } from './audit-labels';

type Item = Schemas['AuditItemDto'];
const TZ = 'America/Bogota';
const PAGE_SIZE = 50;

export function AuditView({ canListUsers }: { canListUsers: boolean }) {
  const today = todayIn(TZ);
  const [from, setFrom] = useState(addDays(today, -6));
  const [to, setTo] = useState(today);
  const [action, setAction] = useState('');
  const [actor, setActor] = useState('');
  const [page, setPage] = useState(1);
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  const logs = useQuery({
    queryKey: ['audit', from, to, action, actor, page],
    queryFn: () =>
      call(
        api.GET('/audit-logs', {
          params: { query: { from, to, page, pageSize: PAGE_SIZE, ...(action ? { action } : {}), ...(actor ? { actorUserId: actor } : {}) } },
        }),
      ),
    placeholderData: (prev) => prev,
  });
  const users = useQuery({
    queryKey: ['users', '', ''],
    queryFn: () => call(api.GET('/users', { params: { query: { pageSize: 100 } } })),
    enabled: canListUsers,
  });
  const items = logs.data?.items ?? [];
  const total = logs.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader title="Auditoría" description="Quién cambió qué y cuándo. Los registros no se pueden editar ni borrar." />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Desde">
          <Input type="date" value={from} max={to} onChange={(e) => reset(setFrom)(e.target.value)} />
        </Field>
        <Field label="Hasta">
          <Input type="date" value={to} min={from} max={today} onChange={(e) => reset(setTo)(e.target.value)} />
        </Field>
        <Field label="Tema">
          <Select value={action} onChange={(e) => reset(setAction)(e.target.value)}>
            <option value="">Todo</option>
            {CATEGORIES.map(([prefix, label]) => (
              <option key={prefix} value={prefix}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        {canListUsers ? (
          <Field label="Hecho por">
            <Select value={actor} onChange={(e) => reset(setActor)(e.target.value)}>
              <option value="">Cualquier persona</option>
              {(users.data?.items ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.firstName} {u.lastName}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
      </div>

      {logs.isPending ? <Spinner /> : null}
      {logs.error ? <Notice tone="error" title="No se pudo cargar la auditoría">{errorMessage(logs.error)}</Notice> : null}
      {logs.data && items.length === 0 ? <Empty title="Nada registrado con estos filtros">Prueba con un rango de fechas más amplio.</Empty> : null}

      {items.length ? (
        <>
          <p className="mb-2 text-sm text-muted">{total === 1 ? '1 registro' : `${total} registros`}</p>
          <ol className="divide-y divide-line rounded-ui border border-line bg-surface" aria-busy={logs.isFetching}>
            {items.map((item) => (
              <AuditEntry key={item.id} item={item} />
            ))}
          </ol>
          {pages > 1 ? (
            <nav className="mt-4 flex items-center justify-center gap-3" aria-label="Páginas">
              <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Anterior
              </Button>
              <span className="text-sm">
                Página {page} de {pages}
              </span>
              <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>
                Siguiente
              </Button>
            </nav>
          ) : null}
        </>
      ) : null}
    </>
  );
}

const when = (iso: string) =>
  new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: TZ }).format(new Date(iso));

function AuditEntry({ item }: { item: Item }) {
  const [open, setOpen] = useState(false);
  const rows = diff(item.before, item.after);
  const link = ENTITY_LINK[item.entityType]?.(item.entityId);
  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <time dateTime={item.createdAt} className="w-full shrink-0 text-sm text-muted tabular-nums sm:w-28">
          {when(item.createdAt)}
        </time>
        <p className="min-w-0 flex-1">
          <span className="font-semibold">{item.actor?.name ?? 'El sistema'}</span> {ACTION_LABEL[item.action] ?? item.action}
          {link ? (
            <>
              {' · '}
              <Link href={link} className="underline underline-offset-4">
                ver
              </Link>
            </>
          ) : null}
        </p>
        {rows.length ? (
          <button className="text-sm underline-offset-4 hover:underline" aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? 'Ocultar detalle' : `Ver detalle (${rows.length})`}
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="mt-2 overflow-x-auto sm:ml-31">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted">
                <th className="py-1 pr-4 font-normal">Campo</th>
                {item.before ? <th className="py-1 pr-4 font-normal">Antes</th> : null}
                {item.after ? <th className="py-1 font-normal">{item.before ? 'Después' : 'Valor'}</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-t border-line align-top">
                  <td className="py-1 pr-4 font-semibold whitespace-nowrap">{r.label}</td>
                  {item.before ? <td className="py-1 pr-4 text-muted">{r.before}</td> : null}
                  {item.after ? <td className="py-1">{r.after}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </li>
  );
}

type Row = { key: string; label: string; before: string; after: string };

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

function show(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  if (typeof v === 'string' && ISO.test(v))
    return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23', timeZone: TZ }).format(new Date(v));
  if (Array.isArray(v)) return v.length ? v.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(', ') : '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** Aplana un nivel: { shiftDefaults: { breakMinutes } } → "shiftDefaults.breakMinutes" */
function flatten(o: Record<string, unknown> | null): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o ?? {})) {
    if (HIDDEN_FIELDS.has(k)) continue;
    if (v && typeof v === 'object' && !Array.isArray(v) && !('id' in v && 'name' in v)) {
      for (const [k2, v2] of Object.entries(v)) out[`${k}.${k2}`] = v2;
    } else if (v && typeof v === 'object' && 'name' in v) {
      out[k] = (v as { name: unknown }).name; // referencias {id, name}
    } else out[k] = v;
  }
  return out;
}

const label = (key: string) =>
  key
    .split('.')
    .map((k) => FIELD_LABEL[k] ?? k)
    .join(' · ');

/** Solo lo que cambió; en creaciones y borrados, todos los datos. */
export function diff(before: Record<string, unknown> | null, after: Record<string, unknown> | null): Row[] {
  const b = flatten(before);
  const a = flatten(after);
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])];
  const rows: Row[] = [];
  for (const key of keys) {
    const vb = b[key];
    const va = a[key];
    if (before && after && JSON.stringify(vb) === JSON.stringify(va)) continue;
    if (!before && (va === null || va === undefined)) continue;
    if (Array.isArray(vb) && Array.isArray(va)) {
      const added = va.filter((x) => !vb.includes(x));
      const removed = vb.filter((x) => !va.includes(x));
      rows.push({
        key,
        label: label(key),
        before: `${vb.length} elementos`,
        after: [added.length ? `Agregó: ${added.join(', ')}` : '', removed.length ? `Quitó: ${removed.join(', ')}` : ''].filter(Boolean).join(' · '),
      });
      continue;
    }
    rows.push({ key, label: label(key), before: show(vb), after: show(va) });
  }
  return rows;
}
