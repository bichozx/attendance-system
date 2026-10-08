'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Badge, Button, Dialog, Empty, Field, Input, Notice, PageHeader, Select, Spinner, Table, Td, Th } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { api, ApiError, call, errorMessage } from '@/lib/api/client';
import { ZONES } from '@/lib/zones';
import { COMPANY_STATUS } from './labels';

export function CompaniesList() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [creating, setCreating] = useState(false);
  const companies = useQuery({
    queryKey: ['platform', 'companies', search, status],
    queryFn: () =>
      call(
        api.GET('/platform/companies', {
          params: { query: { pageSize: 100, ...(search.trim() ? { search: search.trim() } : {}), ...(status ? { status: status as 'ACTIVE' } : {}) } },
        }),
      ),
    placeholderData: (prev) => prev,
  });
  const items = companies.data?.items ?? [];

  return (
    <>
      <PageHeader
        title="Empresas"
        description="Cada empresa es independiente: sus empleados, turnos y reportes no se mezclan con los de otras."
        actions={<Button onClick={() => setCreating(true)}>Nueva empresa</Button>}
      />
      <div className="mb-4 flex flex-wrap gap-3">
        <Input aria-label="Buscar empresa" placeholder="Nombre, NIT o identificador" className="w-72 max-w-full" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select aria-label="Estado" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Todos los estados</option>
          {Object.entries(COMPANY_STATUS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </Select>
      </div>
      {companies.isPending ? <Spinner /> : null}
      {companies.error ? <Notice tone="error" title="No se pudo cargar">{errorMessage(companies.error)}</Notice> : null}
      {companies.data && !items.length ? <Empty title="No hay empresas con estos filtros" /> : null}
      {items.length ? (
        <Table>
          <thead>
            <tr>
              <Th>Empresa</Th>
              <Th>Estado</Th>
              <Th className="text-right">Empleados</Th>
              <Th className="hidden text-right sm:table-cell">Usuarios</Th>
              <Th className="hidden text-right sm:table-cell">Sedes</Th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => {
              const s = COMPANY_STATUS[c.status] ?? { label: c.status, tone: 'neutral' as const };
              return (
                <tr key={c.id} className="hover:bg-paper/50">
                  <Td>
                    <Link href={`/plataforma/${c.id}`} className="font-semibold underline-offset-4 hover:underline">
                      {c.name}
                    </Link>
                    <p className="text-sm text-muted">
                      {c.slug}
                      {c.taxId ? ` · NIT ${c.taxId}` : ''}
                    </p>
                  </Td>
                  <Td>
                    <Badge tone={s.tone}>{s.label}</Badge>
                  </Td>
                  <Td className="text-right tabular-nums">{c.stats.activeEmployees}</Td>
                  <Td className="hidden text-right tabular-nums sm:table-cell">{c.stats.activeUsers}</Td>
                  <Td className="hidden text-right tabular-nums sm:table-cell">{c.stats.stores}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      ) : null}
      <Dialog open={creating} onClose={() => setCreating(false)} title="Nueva empresa">
        <CreateCompanyForm onDone={() => setCreating(false)} />
      </Dialog>
    </>
  );
}

function CreateCompanyForm({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [f, setF] = useState({ name: '', legalName: '', taxId: '', timezone: 'America/Bogota', status: 'TRIAL', email: '', firstName: '', lastName: '' });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const create = useMutation({
    mutationFn: () =>
      call(
        api.POST('/platform/companies', {
          body: {
            name: f.name.trim(),
            ...(f.legalName.trim() ? { legalName: f.legalName.trim() } : {}),
            ...(f.taxId.trim() ? { taxId: f.taxId.trim() } : {}),
            timezone: f.timezone,
            status: f.status as 'TRIAL' | 'ACTIVE',
            admin: { email: f.email.trim(), firstName: f.firstName.trim(), lastName: f.lastName.trim() },
          },
        }),
      ),
    onSuccess: (c) => {
      toast(`${c.name} creada. Le enviamos la invitación a ${f.email.trim()}`);
      void queryClient.invalidateQueries({ queryKey: ['platform'] });
      onDone();
      router.push(`/plataforma/${c.id}`);
    },
  });
  const message =
    create.error instanceof ApiError
      ? ({ COMPANY_TAX_ID_TAKEN: 'Ya hay una empresa con ese NIT.', COMPANY_SLUG_TAKEN: 'Ese identificador ya está en uso.' } as Record<string, string>)[create.error.code] ??
        create.error.message
      : create.error
        ? errorMessage(create.error)
        : null;
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate();
      }}>
      {message ? <Notice tone="error" title={message} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre comercial">
          <Input required minLength={2} maxLength={120} value={f.name} onChange={set('name')} placeholder="Panadería Doña Rosa" />
        </Field>
        <Field label="Razón social (opcional)">
          <Input maxLength={160} value={f.legalName} onChange={set('legalName')} />
        </Field>
        <Field label="NIT (opcional)">
          <Input maxLength={30} pattern="[0-9A-Za-z.\-]{3,30}" value={f.taxId} onChange={set('taxId')} placeholder="900123456-7" />
        </Field>
        <Field label="Zona horaria">
          <Select value={f.timezone} onChange={set('timezone')}>
            {ZONES.map(([z, l]) => (
              <option key={z} value={z}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Estado inicial">
          <Select value={f.status} onChange={set('status')}>
            <option value="TRIAL">Periodo de prueba</option>
            <option value="ACTIVE">Activa</option>
          </Select>
        </Field>
      </div>
      <fieldset className="flex flex-col gap-4 rounded-ui border border-line p-4">
        <legend className="px-1 font-semibold">Primer administrador</legend>
        <p className="text-sm text-muted">Recibe un correo para crear su contraseña (el enlace dura 72 horas). Si ya tiene cuenta, entra con la suya.</p>
        <Field label="Correo">
          <Input type="email" required value={f.email} onChange={set('email')} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombres">
            <Input required maxLength={80} value={f.firstName} onChange={set('firstName')} />
          </Field>
          <Field label="Apellidos">
            <Input required maxLength={80} value={f.lastName} onChange={set('lastName')} />
          </Field>
        </div>
      </fieldset>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" loading={create.isPending}>
          Crear empresa
        </Button>
      </div>
    </form>
  );
}
