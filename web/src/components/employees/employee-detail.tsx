'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';

import { AccessMethodField, type AccessMethod } from '@/components/access-method';
import { Badge, Button, Dialog, Field, Input, Notice, Select, Spinner } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { api, call, errorMessage, type Schemas } from '@/lib/api/client';
import { EMPLOYEE_STATUS } from '@/lib/labels';
import { shortDate, localToday } from '@/lib/time';
import { ContractsSection } from './contracts-section';
import { EmployeeFields, type EmployeeDraft } from './employee-form';

type Employee = Schemas['EmployeeResponseDto'];
type Status = Schemas['ChangeEmployeeStatusDto']['status'];

const today = localToday;

export function EmployeeDetail({ id, can }: { id: string; can: { manage: boolean; access: boolean; readContracts: boolean; manageContracts: boolean } }) {
  const queryClient = useQueryClient();
  const employee = useQuery({ queryKey: ['employee', id], queryFn: () => call(api.GET('/employees/{id}', { params: { path: { id } } })) });
  const [statusOpen, setStatusOpen] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['employee', id] });
    void queryClient.invalidateQueries({ queryKey: ['employees'] });
  };
  if (employee.isPending) return <Spinner />;
  if (employee.error) return <Notice tone="error" title="No se encontró el empleado">{errorMessage(employee.error)}</Notice>;
  const e = employee.data;
  const st = EMPLOYEE_STATUS[e.status];

  return (
    <>
      <Link href="/empleados" className="text-sm text-muted underline-offset-4 hover:underline">
        Empleados
      </Link>
      <header className="mt-1 mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] leading-tight font-bold">
            {e.firstName} {e.lastName}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-muted">
            <Badge tone={st?.tone}>{st?.label ?? e.status}</Badge>
            {e.code} · {e.documentType} {e.documentNumber} · ingresó el {shortDate(e.hireDate)}
            {e.terminationDate ? ` · retiro el ${shortDate(e.terminationDate)}` : ''}
          </p>
        </div>
        {can.manage ? (
          <Button variant="secondary" onClick={() => setStatusOpen(true)}>
            Cambiar estado
          </Button>
        ) : null}
      </header>

      <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section aria-labelledby="datos">
          <h2 id="datos" className="mb-3 text-lg font-bold">
            Datos
          </h2>
          <DataForm key={e.updatedAt} employee={e} canManage={can.manage} onSaved={refresh} />
        </section>

        <div className="flex flex-col gap-10">
          <section aria-labelledby="acceso">
            <h2 id="acceso" className="mb-3 text-lg font-bold">
              Acceso a la app
            </h2>
            <div className="rounded-ui border border-line bg-surface p-5">
              {e.hasAppAccess ? (
                <p>
                  Tiene acceso con <strong>{e.email}</strong>. Puede marcar, ver sus turnos y enviar novedades.
                </p>
              ) : (
                <>
                  <p className="text-muted">Sin acceso: no puede marcar desde el celular.</p>
                  {can.access && e.status !== 'TERMINATED' ? (
                    <Button className="mt-3" onClick={() => setAccessOpen(true)}>
                      Dar acceso a la app
                    </Button>
                  ) : null}
                </>
              )}
            </div>
          </section>

          {can.readContracts ? <ContractsSection employee={e} canManage={can.manageContracts} /> : null}
        </div>
      </div>

      <Dialog open={statusOpen} onClose={() => setStatusOpen(false)} title="Cambiar estado">
        <StatusForm employee={e} onDone={() => { setStatusOpen(false); refresh(); }} />
      </Dialog>
      <Dialog open={accessOpen} onClose={() => setAccessOpen(false)} title="Dar acceso a la app">
        <AccessForm employee={e} onDone={() => { setAccessOpen(false); refresh(); }} />
      </Dialog>
    </>
  );
}

/** Formulario de datos: su estado inicial sale del empleado (se reinicia si cambia en el servidor). */
function DataForm({ employee: e, canManage, onSaved }: { employee: Employee; canManage: boolean; onSaved: () => void }) {
  const toast = useToast();
  const [draft, setDraft] = useState<EmployeeDraft>(() => ({
    code: e.code,
    documentType: e.documentType as EmployeeDraft['documentType'],
    documentNumber: e.documentNumber,
    firstName: e.firstName,
    lastName: e.lastName,
    email: e.email,
    phone: e.phone,
    hireDate: e.hireDate,
    positionId: e.position?.id ?? null,
    defaultStoreId: e.defaultStore?.id ?? null,
  }));
  const save = useMutation({
    mutationFn: () =>
      call(
        api.PATCH('/employees/{id}', {
          params: { path: { id: e.id } },
          body: {
            firstName: draft.firstName,
            lastName: draft.lastName,
            email: draft.email,
            phone: draft.phone,
            hireDate: draft.hireDate,
            positionId: draft.positionId,
            defaultStoreId: draft.defaultStoreId,
          },
        }),
      ),
    onSuccess: () => {
      toast('Cambios guardados');
      onSaved();
    },
  });
  return (
    <form
      className="flex flex-col gap-4 rounded-ui border border-line bg-surface p-5"
      onSubmit={(ev) => {
        ev.preventDefault();
        save.mutate();
      }}>
      <fieldset disabled={!canManage} className="contents">
        {save.error ? <Notice tone="error" title={errorMessage(save.error)} /> : null}
        <EmployeeFields value={draft} onChange={setDraft} isNew={false} />
      </fieldset>
      {canManage ? (
        <div>
          <Button type="submit" loading={save.isPending}>
            Guardar cambios
          </Button>
        </div>
      ) : null}
    </form>
  );
}

function StatusForm({ employee: e, onDone }: { employee: Employee; onDone: () => void }) {
  const toast = useToast();
  const options: [Status, string][] = [
    ['ACTIVE', 'Activo'],
    ['ON_LEAVE', 'En licencia'],
    ['INACTIVE', 'Inactivo'],
    ['TERMINATED', 'Retirado'],
  ];
  const [status, setStatus] = useState<Status>(e.status === 'ACTIVE' ? 'ON_LEAVE' : 'ACTIVE');
  const [date, setDate] = useState(today());
  const rehire = e.status === 'TERMINATED' && status === 'ACTIVE';
  const change = useMutation({
    mutationFn: () =>
      call(
        api.PATCH('/employees/{id}/status', {
          params: { path: { id: e.id } },
          body: { status, ...(status === 'TERMINATED' && { terminationDate: date }), ...(rehire && { rehireDate: date }) },
        }),
      ),
    onSuccess: () => {
      toast(`Estado actualizado: ${EMPLOYEE_STATUS[status].label}`);
      onDone();
    },
  });
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(ev) => {
        ev.preventDefault();
        change.mutate();
      }}>
      {change.error ? <Notice tone="error" title={errorMessage(change.error)} /> : null}
      <Field label="Nuevo estado">
        <Select value={status} onChange={(ev) => setStatus(ev.target.value as Status)}>
          {options.filter(([k]) => k !== e.status).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </Select>
      </Field>
      {status === 'TERMINATED' || rehire ? (
        <Field label={rehire ? 'Fecha de reintegro' : 'Fecha de retiro'}>
          <Input type="date" required value={date} onChange={(ev) => setDate(ev.target.value)} />
        </Field>
      ) : null}
      {status === 'TERMINATED' ? (
        <Notice tone="warn" title="Al retirarlo">
          Pierde el acceso a la app, se cierran sus sesiones y su contrato vigente termina en esa fecha.
        </Notice>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" variant={status === 'TERMINATED' ? 'danger' : 'primary'} loading={change.isPending}>
          {status === 'TERMINATED' ? 'Retirar empleado' : 'Guardar estado'}
        </Button>
      </div>
    </form>
  );
}

function AccessForm({ employee: e, onDone }: { employee: Employee; onDone: () => void }) {
  const toast = useToast();
  const [email, setEmail] = useState(e.email ?? '');
  const [method, setMethod] = useState<AccessMethod>('invite');
  const [password, setPassword] = useState('');
  const grant = useMutation({
    mutationFn: () =>
      call(
        api.POST('/employees/{id}/access', {
          params: { path: { id: e.id } },
          body: { email: email.trim(), ...(method === 'password' ? { password } : {}) },
        }),
      ),
    onSuccess: (r) => {
      toast(
        r.invited
          ? `Le enviamos la invitación a ${email.trim()}`
          : r.existingAccount
            ? `${e.firstName} ya tiene acceso: entra con la contraseña que ya usa`
            : `${e.firstName} ya tiene acceso a la app`,
      );
      onDone();
    },
  });
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(ev) => {
        ev.preventDefault();
        grant.mutate();
      }}>
      {grant.error ? <Notice tone="error" title={errorMessage(grant.error)} /> : null}
      <Field label="Correo con el que entrará">
        <Input type="email" required value={email} onChange={(ev) => setEmail(ev.target.value)} />
      </Field>
      <AccessMethodField method={method} onMethod={setMethod} password={password} onPassword={setPassword} />
      <p className="text-sm text-muted">Si el correo ya tiene cuenta (por ejemplo, en otra empresa), se usa esa cuenta: no se envía invitación y su contraseña no cambia.</p>
      <div className="flex justify-end">
        <Button type="submit" loading={grant.isPending}>
          Dar acceso
        </Button>
      </div>
    </form>
  );
}
