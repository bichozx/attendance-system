'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';

import { Badge, Button, Field, Input, Notice, Select, Spinner, Textarea } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { api, ApiError, call, errorMessage, type Schemas } from '@/lib/api/client';
import { ZONES } from '@/lib/zones';
import { COMPANY_STATUS } from './labels';

type Company = Schemas['PlatformCompanyDetailDto'];
type Status = 'TRIAL' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED';

export function PlatformCompanyDetail({ id }: { id: string }) {
  const company = useQuery({
    queryKey: ['platform', 'company', id],
    queryFn: () => call(api.GET('/platform/companies/{id}', { params: { path: { id } } })),
  });
  if (company.isPending) return <Spinner />;
  if (company.error) return <Notice tone="error" title="No se pudo cargar la empresa">{errorMessage(company.error)}</Notice>;
  const c = company.data;
  const s = COMPANY_STATUS[c.status] ?? { label: c.status, tone: 'done' as const };
  return (
    <>
      <Link href="/plataforma" className="text-sm underline-offset-4 hover:underline">
        ← Empresas
      </Link>
      <div className="mt-2 mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{c.name}</h1>
        <Badge tone={s.tone}>{s.label}</Badge>
      </div>
      <dl className="mb-6 grid grid-cols-3 gap-3 sm:max-w-md">
        {[
          ['Empleados', c.stats.activeEmployees],
          ['Usuarios', c.stats.activeUsers],
          ['Sedes', c.stats.stores],
        ].map(([label, n]) => (
          <div key={label} className="rounded-ui border border-line bg-surface px-4 py-3">
            <dt className="text-sm text-muted">{label}</dt>
            <dd className="text-2xl font-bold tabular-nums">{n}</dd>
          </div>
        ))}
      </dl>
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <EditCompany key={c.updatedAt} company={c} />
        <div className="flex flex-col gap-6">
          <Admins company={c} />
          <StatusCard company={c} />
        </div>
      </div>
    </>
  );
}

function useRefresh(id: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['platform', 'company', id] });
    void queryClient.invalidateQueries({ queryKey: ['platform', 'companies'] });
  };
}

function EditCompany({ company }: { company: Company }) {
  const toast = useToast();
  const refresh = useRefresh(company.id);
  const [f, setF] = useState({
    name: company.name,
    legalName: company.legalName ?? '',
    taxId: company.taxId ?? '',
    slug: company.slug,
    timezone: company.timezone,
    country: company.country,
    currency: company.currency,
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const zones = ZONES.some(([z]) => z === company.timezone) ? ZONES : [[company.timezone, company.timezone] as [string, string], ...ZONES];
  const save = useMutation({
    mutationFn: () =>
      call(
        api.PATCH('/platform/companies/{id}', {
          params: { path: { id: company.id } },
          body: {
            name: f.name.trim(),
            legalName: f.legalName.trim() || null,
            taxId: f.taxId.trim() || null,
            slug: f.slug.trim(),
            timezone: f.timezone,
            country: f.country.trim().toUpperCase(),
            currency: f.currency.trim().toUpperCase(),
          },
        }),
      ),
    onSuccess: () => {
      toast('Datos guardados');
      refresh();
    },
  });
  const message =
    save.error instanceof ApiError
      ? ({ COMPANY_TAX_ID_TAKEN: 'Ya hay otra empresa con ese NIT.', COMPANY_SLUG_TAKEN: 'Ese identificador ya está en uso.' } as Record<string, string>)[save.error.code] ?? save.error.message
      : save.error
        ? errorMessage(save.error)
        : null;
  return (
    <form
      className="flex flex-col gap-4 rounded-ui border border-line bg-surface p-5"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}>
      <h2 className="font-semibold">Datos de la empresa</h2>
      {message ? <Notice tone="error" title={message} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre comercial">
          <Input required minLength={2} maxLength={120} value={f.name} onChange={set('name')} />
        </Field>
        <Field label="Razón social">
          <Input maxLength={160} value={f.legalName} onChange={set('legalName')} />
        </Field>
        <Field label="NIT">
          <Input maxLength={30} pattern="[0-9A-Za-z.\-]{3,30}" value={f.taxId} onChange={set('taxId')} />
        </Field>
        <Field label="Identificador" hint="Minúsculas, números y guiones.">
          <Input required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={50} value={f.slug} onChange={set('slug')} />
        </Field>
        <Field label="Zona horaria">
          <Select value={f.timezone} onChange={set('timezone')}>
            {zones.map(([z, l]) => (
              <option key={z} value={z}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="País">
            <Input required pattern="[A-Za-z]{2}" maxLength={2} value={f.country} onChange={set('country')} />
          </Field>
          <Field label="Moneda">
            <Input required pattern="[A-Za-z]{3}" maxLength={3} value={f.currency} onChange={set('currency')} />
          </Field>
        </div>
      </div>
      <div>
        <Button type="submit" loading={save.isPending}>
          Guardar datos
        </Button>
      </div>
    </form>
  );
}

function Admins({ company }: { company: Company }) {
  const toast = useToast();
  const resend = useMutation({
    mutationFn: (userId: string) => call(api.POST('/platform/companies/{id}/admins/{userId}/invitation', { params: { path: { id: company.id, userId } } })),
    onSuccess: (_, userId) => toast(`Invitación reenviada a ${company.admins.find((a) => a.userId === userId)?.email}`),
  });
  return (
    <section className="rounded-ui border border-line bg-surface p-5">
      <h2 className="mb-2 font-semibold">Administradores</h2>
      {resend.error ? <Notice tone="error" title={errorMessage(resend.error)} /> : null}
      {company.admins.length === 0 ? <p className="text-sm text-warn">Esta empresa no tiene administradores activos.</p> : null}
      <ul className="divide-y divide-line">
        {company.admins.map((a) => (
          <li key={a.userId} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <div className="min-w-0">
              <p className="font-semibold">
                {a.firstName} {a.lastName}
              </p>
              <p className="text-sm break-all text-muted">{a.email}</p>
              {!a.hasLoggedIn ? <p className="text-sm text-warn">Aún no ha creado su contraseña</p> : null}
            </div>
            {!a.hasLoggedIn ? (
              <Button size="sm" variant="secondary" loading={resend.isPending && resend.variables === a.userId} onClick={() => resend.mutate(a.userId)}>
                Reenviar invitación
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

const TRANSITIONS: Record<string, { to: Status; label: string; danger?: boolean }[]> = {
  TRIAL: [
    { to: 'ACTIVE', label: 'Activar' },
    { to: 'SUSPENDED', label: 'Suspender', danger: true },
    { to: 'CANCELLED', label: 'Dar de baja', danger: true },
  ],
  ACTIVE: [
    { to: 'SUSPENDED', label: 'Suspender', danger: true },
    { to: 'CANCELLED', label: 'Dar de baja', danger: true },
  ],
  SUSPENDED: [
    { to: 'ACTIVE', label: 'Reactivar' },
    { to: 'CANCELLED', label: 'Dar de baja', danger: true },
  ],
  CANCELLED: [{ to: 'ACTIVE', label: 'Reactivar' }],
};

function StatusCard({ company }: { company: Company }) {
  const toast = useToast();
  const refresh = useRefresh(company.id);
  const [target, setTarget] = useState<Status | null>(null);
  const [reason, setReason] = useState('');
  const change = useMutation({
    mutationFn: () => call(api.PATCH('/platform/companies/{id}/status', { params: { path: { id: company.id } }, body: { status: target!, ...(reason.trim() ? { reason: reason.trim() } : {}) } })),
    onSuccess: (c) => {
      toast(`${c.name}: ${COMPANY_STATUS[c.status]?.label ?? c.status}`);
      setTarget(null);
      setReason('');
      refresh();
    },
  });
  const blocks = target === 'SUSPENDED' || target === 'CANCELLED';
  return (
    <section className="rounded-ui border border-line bg-surface p-5">
      <h2 className="mb-1 font-semibold">Estado</h2>
      <p className="mb-3 text-sm text-muted">Suspender o cancelar bloquea el acceso de inmediato y cierra las sesiones abiertas. Los datos no se borran.</p>
      {change.error ? <Notice tone="error" title={errorMessage(change.error)} /> : null}
      {target ? (
        <div className="flex flex-col gap-3">
          <p>
            Pasar a <strong>{COMPANY_STATUS[target].label.toLowerCase()}</strong>
            {blocks ? '. Nadie de esta empresa podrá entrar hasta que se reactive.' : '.'}
          </p>
          <Field label="Motivo (opcional)" hint="Queda en la auditoría.">
            <Textarea rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={blocks ? 'Factura de octubre vencida' : ''} />
          </Field>
          <div className="flex gap-2">
            <Button variant={blocks ? 'danger' : 'primary'} loading={change.isPending} onClick={() => change.mutate()}>
              Confirmar
            </Button>
            <Button variant="secondary" onClick={() => setTarget(null)}>
              Volver
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {(TRANSITIONS[company.status] ?? []).map((t) => (
            <Button key={t.to} size="sm" variant={t.danger ? 'secondary' : 'primary'} className={t.danger ? 'text-missing' : ''} onClick={() => setTarget(t.to)}>
              {t.label}
            </Button>
          ))}
        </div>
      )}
    </section>
  );
}
