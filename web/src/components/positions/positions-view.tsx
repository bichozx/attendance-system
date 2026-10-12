'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';

import { usePositions } from '@/components/employees/position-select';
import { Badge, Button, Dialog, Empty, Field, Input, Notice, PageHeader, Spinner, Table, Td, Textarea, Th } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { api, call, errorMessage, type Schemas } from '@/lib/api/client';

type Position = Schemas['PositionResponseDto'];

/** Cargos de la empresa: Cocina, Caja, Bar… Se asignan en la ficha de cada empleado. */
export function PositionsView({ canManage }: { canManage: boolean }) {
  const positions = usePositions(true);
  const [editing, setEditing] = useState<Position | 'new' | null>(null);
  const items = positions.data ?? [];
  const active = items.filter((p) => p.isActive);
  const inactive = items.filter((p) => !p.isActive);

  return (
    <>
      <PageHeader
        title="Cargos"
        description="El puesto de cada persona en la operación. Se asigna en la ficha del empleado y sirve para filtrar la lista de empleados."
        actions={canManage ? <Button onClick={() => setEditing('new')}>Nuevo cargo</Button> : null}
      />
      {positions.isPending ? <Spinner /> : null}
      {positions.error ? <Notice tone="error" title="No se pudo cargar la lista">{errorMessage(positions.error)}</Notice> : null}
      {positions.data && items.length === 0 ? <Empty title="Aún no hay cargos">Crea el primero con “Nuevo cargo”.</Empty> : null}
      {items.length ? (
        <Table>
          <thead>
            <tr>
              <Th>Cargo</Th>
              <Th>Personas</Th>
              <Th>Estado</Th>
              {canManage ? (
                <Th>
                  <span className="sr-only">Acciones</span>
                </Th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {[...active, ...inactive].map((p) => (
              <PositionRow key={p.id} position={p} canManage={canManage} onEdit={() => setEditing(p)} />
            ))}
          </tbody>
        </Table>
      ) : null}

      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Nuevo cargo' : 'Editar cargo'}>
        {editing ? <PositionForm position={editing === 'new' ? null : editing} onDone={() => setEditing(null)} /> : null}
      </Dialog>
    </>
  );
}

function PositionRow({ position: p, canManage, onEdit }: { position: Position; canManage: boolean; onEdit: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const toggle = useMutation({
    mutationFn: () => call(api.PATCH('/positions/{id}', { params: { path: { id: p.id } }, body: { isActive: !p.isActive } })),
    onSuccess: () => {
      toast(p.isActive ? `“${p.name}” quedó desactivado` : `“${p.name}” está activo de nuevo`);
      void queryClient.invalidateQueries({ queryKey: ['positions'] });
    },
    onError: (e) => toast(errorMessage(e)),
  });
  return (
    <tr className={p.isActive ? 'hover:bg-paper/50' : 'text-muted hover:bg-paper/50'}>
      <Td>
        <span className="font-semibold">{p.name}</span>
        {p.description ? <p className="text-sm text-muted">{p.description}</p> : null}
      </Td>
      <Td className="whitespace-nowrap">
        {p.employeeCount ? (
          <Link href={`/empleados?cargo=${p.id}`} className="underline-offset-4 hover:underline">
            {p.employeeCount} {p.employeeCount === 1 ? 'persona' : 'personas'}
          </Link>
        ) : (
          <span className="text-muted">Nadie</span>
        )}
      </Td>
      <Td>{p.isActive ? <Badge tone="working">Activo</Badge> : <Badge>Desactivado</Badge>}</Td>
      {canManage ? (
        <Td className="text-right whitespace-nowrap">
          <span className="inline-flex gap-3">
            <Button variant="quiet" size="sm" onClick={onEdit} aria-label={`Editar el cargo ${p.name}`}>
              Editar
            </Button>
            <Button
              variant="quiet"
              size="sm"
              loading={toggle.isPending}
              onClick={() => toggle.mutate()}
              aria-label={`${p.isActive ? 'Desactivar' : 'Activar'} el cargo ${p.name}`}
              title={p.isActive ? 'Deja de ofrecerse al asignar cargos; quienes ya lo tienen lo conservan.' : undefined}>
              {p.isActive ? 'Desactivar' : 'Activar'}
            </Button>
          </span>
        </Td>
      ) : null}
    </tr>
  );
}

function PositionForm({ position, onDone }: { position: Position | null; onDone: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState(position?.name ?? '');
  const [description, setDescription] = useState(position?.description ?? '');
  const save = useMutation({
    mutationFn: () => {
      const body = { name: name.trim(), description: description.trim() || null };
      return position
        ? call(api.PATCH('/positions/{id}', { params: { path: { id: position.id } }, body }))
        : call(api.POST('/positions', { body }));
    },
    onSuccess: (p) => {
      toast(position ? 'Cargo actualizado' : `Cargo “${p.name}” creado`);
      void queryClient.invalidateQueries({ queryKey: ['positions'] });
      void queryClient.invalidateQueries({ queryKey: ['employees'] });
      onDone();
    },
  });
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}>
      {save.error ? <Notice tone="error" title={errorMessage(save.error)} /> : null}
      <Field label="Nombre del cargo" hint="Ej: Cocina, Caja, Supernumeraria de servicio">
        <Input required minLength={2} maxLength={80} autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Descripción (opcional)">
        <Textarea maxLength={255} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      {position && position.employeeCount > 0 ? (
        <p className="text-sm text-muted">El cambio de nombre se verá en la ficha de las {position.employeeCount === 1 ? 'persona' : `${position.employeeCount} personas`} que lo tienen.</p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" loading={save.isPending}>
          {position ? 'Guardar' : 'Crear cargo'}
        </Button>
      </div>
    </form>
  );
}
