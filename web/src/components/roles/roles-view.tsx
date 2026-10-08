'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Badge, Button, Field, Input, Notice, PageHeader, Spinner, Textarea } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { api, ApiError, call, errorMessage, type Schemas } from '@/lib/api/client';

type Role = Schemas['RoleResponseDto'];
type Permission = Schemas['PermissionResponseDto'];

const MODULES: [string, string][] = [
  ['attendance', 'Asistencia'],
  ['shifts', 'Turnos y cambios de turno'],
  ['incidents', 'Novedades'],
  ['employees', 'Empleados y contratos'],
  ['stores', 'Establecimientos'],
  ['reports', 'Reportes'],
  ['notifications', 'Avisos'],
  ['users', 'Usuarios'],
  ['roles', 'Roles'],
  ['companies', 'Empresa'],
  ['audit', 'Auditoría'],
];

/** Permisos que solo tienen sentido para la propia persona (se usan desde la app). */
const OWN = new Set(['attendance.clock', 'attendance.read_own', 'incidents.request', 'incidents.read_own', 'shifts.read_own', 'shift_changes.request']);

/** Un permiso de gestión sin el de lectura deja pantallas a medias: se marcan juntos. */
const REQUIRES: Record<string, string> = {
  'users.manage': 'users.read',
  'roles.manage': 'roles.read',
  'employees.manage': 'employees.read',
  'contracts.manage': 'contracts.read',
  'stores.manage': 'stores.read',
  'shifts.manage': 'shifts.read',
  'shifts.publish': 'shifts.read',
  'attendance.adjust': 'attendance.read',
  'incidents.approve': 'incidents.read',
  'reports.export': 'reports.read',
  'companies.update': 'companies.read',
};

type Editing = { mode: 'new'; from?: Role } | { mode: 'edit'; role: Role } | null;

export function RolesView({ canManage }: { canManage: boolean }) {
  const roles = useQuery({ queryKey: ['roles'], queryFn: () => call(api.GET('/roles', {})) });
  const permissions = useQuery({ queryKey: ['permissions'], queryFn: () => call(api.GET('/permissions', {})) });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);

  if (roles.isPending || permissions.isPending) return <Spinner />;
  if (roles.error || permissions.error) return <Notice tone="error" title="No se pudo cargar">{errorMessage(roles.error ?? permissions.error)}</Notice>;

  const list = roles.data;
  const selected = list.find((r) => r.id === selectedId) ?? list[0];

  return (
    <>
      <PageHeader
        title="Roles y permisos"
        description="Un rol agrupa lo que una persona puede ver y hacer. Los roles del sistema no se editan; duplica uno para ajustarlo."
        actions={canManage ? <Button onClick={() => setEditing({ mode: 'new' })}>Nuevo rol</Button> : null}
      />
      <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
        <ul className="flex flex-col gap-1" aria-label="Roles">
          {list.map((r) => {
            const active = !editing && r.id === selected?.id;
            return (
              <li key={r.id}>
                <button
                  onClick={() => {
                    setSelectedId(r.id);
                    setEditing(null);
                  }}
                  aria-current={active ? 'true' : undefined}
                  className={`w-full rounded-ui border px-3 py-2 text-left ${active ? 'border-ink bg-surface' : 'border-transparent hover:bg-surface'}`}>
                  <span className="flex items-center justify-between gap-2 font-semibold">
                    {r.name}
                    {r.isSystem ? <Badge>Sistema</Badge> : null}
                  </span>
                  <span className="text-sm text-muted">{r.permissions.length === 1 ? '1 permiso' : `${r.permissions.length} permisos`}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <section className="rounded-ui border border-line bg-surface p-5">
          {editing ? (
            <RoleForm
              key={editing.mode === 'edit' ? editing.role.id : `new-${editing.from?.id ?? ''}`}
              editing={editing}
              permissions={permissions.data}
              onDone={(id) => {
                setEditing(null);
                if (id) setSelectedId(id);
              }}
            />
          ) : selected ? (
            <RoleDetail
              role={selected}
              permissions={permissions.data}
              canManage={canManage}
              onEdit={() => setEditing({ mode: 'edit', role: selected })}
              onDuplicate={() => setEditing({ mode: 'new', from: selected })}
              onDeleted={() => setSelectedId(null)}
            />
          ) : null}
        </section>
      </div>
    </>
  );
}

function RoleDetail({
  role,
  permissions,
  canManage,
  onEdit,
  onDuplicate,
  onDeleted,
}: {
  role: Role;
  permissions: Permission[];
  canManage: boolean;
  onEdit: () => void;
  onDuplicate: () => void;
  onDeleted: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const remove = useMutation({
    mutationFn: () => call(api.DELETE('/roles/{id}', { params: { path: { id: role.id } } })),
    onSuccess: () => {
      toast(`Rol ${role.name} eliminado`);
      void queryClient.invalidateQueries({ queryKey: ['roles'] });
      onDeleted();
    },
  });
  const removeError =
    remove.error instanceof ApiError && remove.error.code === 'ROLE_IN_USE'
      ? 'Hay usuarios con este rol. Cámbiales el rol en Usuarios y vuelve a intentarlo.'
      : remove.error
        ? errorMessage(remove.error)
        : null;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold">
            {role.name} {role.isSystem ? <Badge>Sistema</Badge> : null}
          </h2>
          <p className="text-sm text-muted">{role.code}</p>
          {role.description ? <p className="mt-1">{role.description}</p> : null}
        </div>
        {canManage ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={onDuplicate}>
              Duplicar
            </Button>
            {!role.isSystem ? (
              <>
                <Button size="sm" onClick={onEdit}>
                  Editar
                </Button>
                <Button size="sm" variant="quiet" className="text-missing" onClick={() => setConfirm(true)}>
                  Eliminar
                </Button>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
      {confirm ? (
        <Notice tone="warn" title={`¿Eliminar el rol ${role.name}?`}>
          <p>Solo se puede si nadie lo tiene asignado.</p>
          {removeError ? <p className="mt-1 font-semibold text-missing">{removeError}</p> : null}
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>
              Eliminar
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setConfirm(false)}>
              No
            </Button>
          </div>
        </Notice>
      ) : null}
      <PermissionGrid permissions={permissions} value={role.permissions} readOnly />
    </div>
  );
}

function PermissionGrid({ permissions, value, onChange, readOnly }: { permissions: Permission[]; value: string[]; onChange?: (v: string[]) => void; readOnly?: boolean }) {
  const toggle = (code: string) => {
    if (!onChange) return;
    if (value.includes(code)) {
      // Quitar la lectura también quita lo que depende de ella
      const dependents = Object.entries(REQUIRES)
        .filter(([, req]) => req === code)
        .map(([p]) => p);
      onChange(value.filter((v) => v !== code && !dependents.includes(v)));
    } else {
      const req = REQUIRES[code];
      onChange([...new Set([...value, code, ...(req ? [req] : [])])]);
    }
  };
  const known = new Set(MODULES.map(([m]) => m));
  const groups = [...MODULES, ...[...new Set(permissions.map((p) => p.module))].filter((m) => !known.has(m)).map((m) => [m, m] as [string, string])];
  return (
    <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
      {groups.map(([module, label]) => {
        const items = permissions.filter((p) => p.module === module);
        if (!items.length) return null;
        return (
          <fieldset key={module}>
            <legend className="mb-1 font-semibold">{label}</legend>
            <ul className="flex flex-col gap-0.5">
              {items.map((p) => {
                const on = value.includes(p.code);
                return (
                  <li key={p.code}>
                    <label className={`flex items-start gap-2.5 rounded px-1 py-0.5 ${readOnly ? '' : 'cursor-pointer hover:bg-paper'} ${readOnly && !on ? 'text-upcoming' : ''}`}>
                      <input type="checkbox" className="mt-1 size-4 accent-ink" checked={on} disabled={readOnly} onChange={() => toggle(p.code)} />
                      <span>
                        {p.description ?? p.code}
                        {OWN.has(p.code) ? <span className="ml-1.5 text-xs text-muted">(app)</span> : null}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        );
      })}
    </div>
  );
}

function RoleForm({ editing, permissions, onDone }: { editing: NonNullable<Editing>; permissions: Permission[]; onDone: (id?: string) => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const base = editing.mode === 'edit' ? editing.role : editing.from;
  const [name, setName] = useState(editing.mode === 'edit' ? editing.role.name : base ? `${base.name} (copia)` : '');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState(base?.description ?? '');
  const [selected, setSelected] = useState<string[]>(base?.permissions ?? ['attendance.clock', 'attendance.read_own', 'shifts.read_own']);

  const save = useMutation({
    mutationFn: () =>
      editing.mode === 'edit'
        ? call(api.PATCH('/roles/{id}', { params: { path: { id: editing.role.id } }, body: { name, description: description.trim() || null, permissions: selected } }))
        : call(api.POST('/roles', { body: { code: code || autoCode(name), name, description: description.trim() || null, permissions: selected } })),
    onSuccess: (r) => {
      toast(editing.mode === 'edit' ? `Rol ${r.name} actualizado` : `Rol ${r.name} creado`);
      void queryClient.invalidateQueries({ queryKey: ['roles'] });
      onDone(r.id);
    },
  });
  const message = save.error instanceof ApiError && save.error.code === 'ROLE_CODE_TAKEN' ? 'Ya existe un rol con ese código.' : save.error ? errorMessage(save.error) : null;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}>
      <h2 className="text-xl font-bold">{editing.mode === 'edit' ? `Editar ${editing.role.name}` : 'Nuevo rol'}</h2>
      {message ? <Notice tone="error" title={message} /> : null}
      {editing.mode === 'edit' ? <Notice tone="neutral" title="Los cambios aplican de inmediato">Quienes tengan este rol verán el cambio en su siguiente acción.</Notice> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre">
          <Input required minLength={2} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Cajero líder" />
        </Field>
        {editing.mode === 'new' ? (
          <Field label="Código" hint="Mayúsculas y guion bajo; no se puede cambiar.">
            <Input maxLength={40} value={code} placeholder={autoCode(name) || 'CAJERO_LIDER'} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_'))} />
          </Field>
        ) : null}
      </div>
      <Field label="Descripción (opcional)">
        <Textarea rows={2} maxLength={255} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <div>
        <p className="mb-2 text-sm text-muted">
          {selected.length} de {permissions.length} permisos. Al marcar un permiso de gestión se marca también el de ver.
        </p>
        <PermissionGrid permissions={permissions} value={selected} onChange={setSelected} />
      </div>
      <div className="flex justify-end gap-2 border-t border-line pt-4">
        <Button type="button" variant="secondary" onClick={() => onDone()}>
          Cancelar
        </Button>
        <Button type="submit" loading={save.isPending} disabled={!selected.length}>
          {editing.mode === 'edit' ? 'Guardar cambios' : 'Crear rol'}
        </Button>
      </div>
    </form>
  );
}

/** "Cajero líder" → "CAJERO_LIDER" */
function autoCode(name: string) {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);
}
