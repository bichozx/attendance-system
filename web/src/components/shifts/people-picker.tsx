'use client';

import { useMemo, useState } from 'react';

import { Input } from '@/components/ui';
import type { Schemas } from '@/lib/api/client';

type Employee = Schemas['EmployeeResponseDto'];

/**
 * Lista de casillas para elegir empleados: primero los de la sede, luego el resto.
 * `exclude` oculta a quienes ya están en el turno.
 */
export function PeoplePicker({
  employees,
  storeId,
  value,
  onChange,
  exclude = [],
}: {
  employees: Employee[];
  storeId: string;
  value: string[];
  onChange: (ids: string[]) => void;
  exclude?: string[];
}) {
  const [query, setQuery] = useState('');
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return employees
      .filter((e) => !exclude.includes(e.id))
      .filter((e) => !q || `${e.firstName} ${e.lastName} ${e.code}`.toLowerCase().includes(q))
      .sort((a, b) => {
        const sa = a.defaultStore?.id === storeId ? 0 : 1;
        const sb = b.defaultStore?.id === storeId ? 0 : 1;
        return sa - sb || a.firstName.localeCompare(b.firstName, 'es');
      });
  }, [employees, exclude, query, storeId]);

  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);

  return (
    <div className="rounded-ui border border-line">
      <div className="border-b border-line p-2">
        <Input aria-label="Buscar empleado" placeholder="Buscar por nombre o código" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <ul className="max-h-56 overflow-y-auto py-1" aria-label="Empleados">
        {list.length === 0 ? <li className="px-3 py-2 text-sm text-muted">Nadie coincide con la búsqueda.</li> : null}
        {list.map((e) => (
          <li key={e.id}>
            <label className="flex cursor-pointer items-center gap-3 px-3 py-1.5 hover:bg-paper">
              <input type="checkbox" className="size-4 accent-ink" checked={value.includes(e.id)} onChange={() => toggle(e.id)} />
              <span className="flex-1">
                {e.firstName} {e.lastName}
                <span className="ml-2 text-sm text-muted">{e.position?.name ?? e.code}</span>
              </span>
              {e.defaultStore && e.defaultStore.id !== storeId ? <span className="text-xs text-muted">{e.defaultStore.name}</span> : null}
            </label>
          </li>
        ))}
      </ul>
      {value.length ? <p className="border-t border-line px-3 py-1.5 text-sm text-muted">{value.length === 1 ? '1 persona elegida' : `${value.length} personas elegidas`}</p> : null}
    </div>
  );
}
