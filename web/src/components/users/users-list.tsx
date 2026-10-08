'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';

import { Badge, Button, Dialog, Empty, Field, Input, Notice, PageHeader, Select, Spinner, Table, Td, Th } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { api, ApiError, call, errorMessage, type Schemas } from '@/lib/api/client';
import { AccessMethodField, type AccessMethod } from '@/components/access-method';

type User = Schemas['CompanyUserResponseDto'];
type Role = Schemas['RoleResponseDto'];

const STATUS: Record<string, { label: string; tone: 'working' | 'warn' | 'done' }> = {
  ACTIVE: { label: 'Activo', tone: 'working' },
  INVITED: { label: 'Invitación pendiente', tone: 'warn' },
  DISABLED: { label: 'Sin acceso', tone: 'done' },
};

/** Estado efectivo: si la cuenta o la membresía están desactivadas, no entra. */
const statusOf = (u: User) => (u.membershipStatus !== 'ACTIVE' ? u.membershipStatus : u.invitationPending ? 'INVITED' : u.accountStatus);

const lastLogin = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Bogota' }).format(new Date(iso)) : 'Nunca';

export function UsersList({ currentUserId, canManage }: { currentUserId: string; canManage: boolean }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<User | null>(null);

  const users = useQuery({
    queryKey: ['users', search, status],
    queryFn: () =>
      call(
        api.GET('/users', {
          params: { query: { pageSize: 100, ...(search.trim() ? { search: search.trim() } : {}), ...(status ? { status: status as 'ACTIVE' } : {}) } },
        }),
      ),
    placeholderData: (prev) => prev,
  });
  const roles = useQuery({ queryKey: ['roles'], queryFn: () => call(api.GET('/roles', {})) });
  const items = users.data?.items ?? [];

  return (
    <>
      <PageHeader
        title="Usuarios"
        description="Quién puede entrar al panel o a la app, y con qué rol. Los empleados que reciben acceso desde su ficha también aparecen aquí."
        actions={canManage ? <Button onClick={() => setCreating(true)}>Nuevo usuario</Button> : null}
      />
      <div className="mb-4 flex flex-wrap gap-3">
        <Input aria-label="Buscar usuario" placeholder="Buscar por nombre o correo" className="w-72 max-w-full" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select aria-label="Estado" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Todos los estados</option>
          <option value="ACTIVE">Activos</option>
          <option value="INVITED">Invitados</option>
          <option value="DISABLED">Sin acceso</option>
        </Select>
      </div>
      {users.isPending ? <Spinner /> : null}
      {users.error ? <Notice tone="error" title="No se pudo cargar la lista">{errorMessage(users.error)}</Notice> : null}
      {users.data && items.length === 0 ? <Empty title="Nadie coincide con la búsqueda" /> : null}
      {items.length ? (
        <Table>
          <thead>
            <tr>
              <Th>Nombre</Th>
              <Th className="hidden sm:table-cell">Rol</Th>
              <Th>Estado</Th>
              <Th className="hidden sm:table-cell">Último ingreso</Th>
            </tr>
          </thead>
          <tbody>
            {items.map((u) => {
              const s = STATUS[statusOf(u)] ?? { label: statusOf(u), tone: 'done' as const };
              return (
                <tr key={u.id} className="hover:bg-paper/50">
                  <Td>
                    <button className="text-left font-semibold underline-offset-4 hover:underline" onClick={() => setSelected(u)}>
                      {u.firstName} {u.lastName}
                    </button>
                    {u.id === currentUserId ? <span className="ml-2 text-sm text-muted">(tú)</span> : null}
                    <p className="text-sm break-all text-muted">{u.email}</p>
                    <p className="text-sm sm:hidden">{u.role.name}</p>
                  </Td>
                  <Td className="hidden sm:table-cell">{u.role.name}</Td>
                  <Td className="whitespace-nowrap">
                    <Badge tone={s.tone}>{s.label}</Badge>
                  </Td>
                  <Td className="hidden whitespace-nowrap sm:table-cell">{lastLogin(u.lastLoginAt)}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      ) : null}

      <Dialog open={creating} onClose={() => setCreating(false)} title="Nuevo usuario">
        <CreateUserForm roles={roles.data ?? []} onDone={() => setCreating(false)} />
      </Dialog>
      <Dialog open={!!selected} onClose={() => setSelected(null)} title={selected ? `${selected.firstName} ${selected.lastName}` : ''}>
        {selected ? (
          <UserPanel
            user={items.find((u) => u.id === selected.id) ?? selected}
            roles={roles.data ?? []}
            isSelf={selected.id === currentUserId}
            canManage={canManage}
          />
        ) : null}
      </Dialog>
    </>
  );
}

function UserPanel({ user, roles, isSelf, canManage }: { user: User; roles: Role[]; isSelf: boolean; canManage: boolean }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [roleId, setRoleId] = useState(user.role.id);
  const done = (m: string) => {
    toast(m);
    void queryClient.invalidateQueries({ queryKey: ['users'] });
  };
  const changeRole = useMutation({
    mutationFn: () => call(api.PATCH('/users/{id}/role', { params: { path: { id: user.id } }, body: { roleId } })),
    onSuccess: (u) => done(`Ahora es ${u.role.name}`),
  });
  const changeStatus = useMutation({
    mutationFn: (status: 'ACTIVE' | 'DISABLED') => call(api.PATCH('/users/{id}/status', { params: { path: { id: user.id } }, body: { status } })),
    onSuccess: (u) => done(u.membershipStatus === 'DISABLED' ? 'Acceso retirado' : 'Acceso restablecido'),
  });
  const reset = useMutation({
    mutationFn: () => call(api.POST('/users/{id}/password-reset', { params: { path: { id: user.id } } })),
    onSuccess: (r) => toast((r as { kind?: string } | undefined)?.kind === 'invitation' ? `Invitación reenviada a ${user.email}` : `Enlace enviado a ${user.email}`),
  });
  const disabled = user.membershipStatus === 'DISABLED';
  const error = changeRole.error ?? changeStatus.error ?? reset.error;

  return (
    <div className="flex flex-col gap-5">
      <dl className="grid grid-cols-[8rem_1fr] gap-y-1 text-sm">
        <dt className="text-muted">Correo</dt>
        <dd className="break-all">{user.email}</dd>
        {user.phone ? (
          <>
            <dt className="text-muted">Teléfono</dt>
            <dd>{user.phone}</dd>
          </>
        ) : null}
        <dt className="text-muted">Último ingreso</dt>
        <dd>{lastLogin(user.lastLoginAt)}</dd>
        <dt className="text-muted">Ficha</dt>
        <dd>
          {user.employeeId ? (
            <Link href={`/empleados/${user.employeeId}`} className="underline underline-offset-4">
              Ver empleado
            </Link>
          ) : (
            'No es empleado'
          )}
        </dd>
      </dl>

      {error ? <Notice tone="error" title={errorMessage(error)} /> : null}
      {isSelf ? <Notice tone="neutral" title="Esta es tu cuenta">No puedes cambiar tu propio rol ni quitarte el acceso; pídeselo a otro administrador.</Notice> : null}

      {canManage && !isSelf ? (
        <>
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              changeRole.mutate();
            }}>
            <div className="flex-1">
              <Field label="Rol">
                <Select value={roleId} onChange={(e) => setRoleId(e.target.value)}>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Button type="submit" variant="secondary" disabled={roleId === user.role.id} loading={changeRole.isPending}>
              Cambiar rol
            </Button>
          </form>
          <div className="flex flex-col gap-3 border-t border-line pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold">{user.invitationPending ? 'Invitación pendiente' : 'Contraseña'}</p>
                <p className="text-sm text-muted">
                  {user.invitationPending
                    ? 'Aún no ha creado su contraseña. Reenvíale la invitación si el enlace se le perdió o venció.'
                    : 'Le llega un enlace al correo para elegir una nueva. Tú no la ves.'}
                </p>
              </div>
              <Button variant="secondary" size="sm" loading={reset.isPending} onClick={() => reset.mutate()}>
                {user.invitationPending ? 'Reenviar invitación' : 'Enviar enlace'}
              </Button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold">{disabled ? 'Sin acceso a la empresa' : 'Acceso'}</p>
                <p className="text-sm text-muted">{disabled ? 'No puede entrar. Su historial se conserva.' : 'Al retirarlo se cierran de inmediato sus sesiones en esta empresa.'}</p>
              </div>
              {disabled ? (
                <Button size="sm" loading={changeStatus.isPending} onClick={() => changeStatus.mutate('ACTIVE')}>
                  Restablecer acceso
                </Button>
              ) : (
                <Button size="sm" variant="danger" loading={changeStatus.isPending} onClick={() => changeStatus.mutate('DISABLED')}>
                  Retirar acceso
                </Button>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function CreateUserForm({ roles, onDone }: { roles: Role[]; onDone: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ email: '', firstName: '', lastName: '', phone: '', roleId: '' });
  const [method, setMethod] = useState<AccessMethod>('invite');
  const [password, setPassword] = useState('');
  const [result, setResult] = useState<Schemas['CreateUserResponseDto'] | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });
  const roleId = form.roleId || roles.find((r) => r.code === 'SUPERVISOR')?.id || roles[0]?.id || '';

  const create = useMutation({
    mutationFn: () =>
      call(
        api.POST('/users', {
          body: { email: form.email.trim(), firstName: form.firstName.trim(), lastName: form.lastName.trim(), roleId, ...(method === 'password' ? { password } : {}), ...(form.phone.trim() ? { phone: form.phone.trim() } : {}) },
        }),
      ),
    onSuccess: (r) => {
      setResult(r);
      toast(`${r.user.firstName} ya tiene acceso`);
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });

  if (result) {
    return (
      <div className="flex flex-col gap-4">
        {result.existingAccount ? (
          <Notice tone="ok" title={`${result.user.email} ya tenía cuenta`}>
            Entra con la contraseña que ya usa (por ejemplo, en otra empresa){method === 'password' ? '. La contraseña temporal no se usó.' : '.'}
          </Notice>
        ) : result.invited ? (
          <Notice tone="ok" title={`Invitación enviada a ${result.user.email}`}>
            Le llegó un enlace para crear su contraseña (vale 72 horas). Si no lo encuentra, revisa la carpeta de spam o reenvíalo desde su ficha.
          </Notice>
        ) : (
          <Notice tone="ok" title="Cuenta creada">
            Compártele estos datos por un medio privado. Al entrar por primera vez deberá cambiar la contraseña.
          </Notice>
        )}
        {!result.existingAccount && !result.invited ? (
          <dl className="grid grid-cols-[7rem_1fr] gap-y-1 rounded-ui bg-paper px-4 py-3">
            <dt className="text-muted">Correo</dt>
            <dd className="font-semibold break-all">{result.user.email}</dd>
            <dt className="text-muted">Contraseña</dt>
            <dd className="font-mono font-semibold">{password}</dd>
          </dl>
        ) : null}
        <div className="flex justify-end">
          <Button onClick={onDone}>Listo</Button>
        </div>
      </div>
    );
  }

  const message =
    create.error instanceof ApiError && create.error.code === 'USER_ALREADY_MEMBER' ? 'Ese correo ya tiene acceso a esta empresa.' : create.error ? errorMessage(create.error) : null;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate();
      }}>
      {message ? <Notice tone="error" title={message} /> : null}
      <Field label="Correo" hint="Si ya tiene cuenta en el sistema (por ejemplo, en otra empresa), solo se le da acceso a esta.">
        <Input type="email" required autoComplete="off" value={form.email} onChange={set('email')} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombres">
          <Input required maxLength={80} value={form.firstName} onChange={set('firstName')} />
        </Field>
        <Field label="Apellidos">
          <Input required maxLength={80} value={form.lastName} onChange={set('lastName')} />
        </Field>
        <Field label="Teléfono (opcional)">
          <Input type="tel" value={form.phone} onChange={set('phone')} />
        </Field>
        <Field label="Rol">
          <Select value={roleId} onChange={set('roleId')}>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <AccessMethodField method={method} onMethod={setMethod} password={password} onPassword={setPassword} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" loading={create.isPending} disabled={!roleId || (method === 'password' && !password)}>
          Crear usuario
        </Button>
      </div>
    </form>
  );
}
