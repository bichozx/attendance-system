'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';

import { Button, Input, Notice, Select } from '@/components/ui';
import { api, call, errorMessage, type Schemas } from '@/lib/api/client';

type Position = Schemas['PositionResponseDto'];

/** Cargos activos de la empresa (los que se pueden asignar). */
export function usePositions(includeInactive = false) {
  return useQuery({
    queryKey: ['positions', includeInactive ? 'all' : 'active'],
    queryFn: () => call(api.GET('/positions', { params: { query: includeInactive ? { includeInactive: true } : {} } })),
  });
}

/**
 * Selector de cargo. Si el empleado tiene un cargo que se desactivó, se sigue mostrando
 * (para no borrárselo al guardar otros datos). Con `canCreate`, permite crear uno nuevo
 * sin salir del formulario.
 */
export function PositionSelect({
  value,
  onChange,
  current,
  canCreate,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  current?: { id: string; name: string } | null;
  canCreate: boolean;
}) {
  const id = useId();
  const positions = usePositions();
  const list = positions.data ?? [];
  const missingCurrent = current && !list.some((p) => p.id === current.id) ? current : null;
  const [creating, setCreating] = useState(false);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-semibold">
          Cargo
        </label>
        {canCreate && !creating ? (
          <button type="button" className="text-sm font-semibold text-brand underline-offset-4 hover:underline" onClick={() => setCreating(true)}>
            + Nuevo cargo
          </button>
        ) : null}
      </div>
      <Select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">Sin cargo</option>
        {missingCurrent ? <option value={missingCurrent.id}>{missingCurrent.name} (desactivado)</option> : null}
        {list.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </Select>
      {creating ? (
        <QuickCreate
          onCancel={() => setCreating(false)}
          onCreated={(p) => {
            setCreating(false);
            onChange(p.id);
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * Alta rápida dentro de otro formulario: no es un <form> (no se pueden anidar), así que
 * Enter se maneja a mano para no enviar el formulario del empleado.
 */
function QuickCreate({ onCancel, onCreated }: { onCancel: () => void; onCreated: (p: Position) => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const create = useMutation({
    mutationFn: () => call(api.POST('/positions', { body: { name: name.trim() } })),
    onSuccess: async (p) => {
      await queryClient.invalidateQueries({ queryKey: ['positions'] });
      onCreated(p);
    },
  });
  const submit = () => {
    if (name.trim().length >= 2) create.mutate();
  };
  return (
    <div className="mt-1 flex flex-col gap-2 rounded-ui border border-line bg-paper/60 p-3">
      {create.error ? <Notice tone="error" title={errorMessage(create.error)} /> : null}
      <div className="flex gap-2">
        <Input
          aria-label="Nombre del nuevo cargo"
          placeholder="Ej: Steward"
          maxLength={80}
          autoFocus
          className="min-w-0 flex-1"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              onCancel();
            }
          }}
        />
        <Button type="button" size="md" loading={create.isPending} disabled={name.trim().length < 2} onClick={submit}>
          Crear
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
