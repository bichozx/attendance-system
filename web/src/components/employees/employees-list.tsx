'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useDeferredValue, useState } from 'react';

import { Badge, Button, Dialog, Empty, Input, Notice, PageHeader, Spinner, Table, Td, Th } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { api, call, errorMessage } from '@/lib/api/client';
import { EMPLOYEE_STATUS } from '@/lib/labels';
import { EmployeeFields, emptyDraft, useDraft } from './employee-form';

const FILTERS = [
  ['', 'Todos'],
  ['ACTIVE', 'Activos'],
  ['ON_LEAVE', 'En licencia'],
  ['INACTIVE', 'Inactivos'],
  ['TERMINATED', 'Retirados'],
] as const;

export function EmployeesList({ canManage }: { canManage: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<(typeof FILTERS)[number][0]>('ACTIVE');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useDraft(emptyDraft());
  const term = useDeferredValue(search.trim());

  const list = useQuery({
    queryKey: ['employees', term, status, page],
    queryFn: () =>
      call(api.GET('/employees', { params: { query: { search: term || undefined, status: status || undefined, page, pageSize: 25 } } })),
    placeholderData: keepPreviousData,
  });

  const create = useMutation({
    mutationFn: () => call(api.POST('/employees', { body: draft })),
    onSuccess: (e) => {
      toast(`${e.firstName} ${e.lastName} quedó registrado`);
      setCreating(false);
      setDraft(emptyDraft());
      void queryClient.invalidateQueries({ queryKey: ['employees'] });
      router.push(`/empleados/${e.id}`);
    },
  });

  return (
    <>
      <PageHeader
        title="Empleados"
        description="Las personas que marcan asistencia. Desde la ficha de cada una gestionas su acceso a la app y sus contratos."
        actions={
          canManage ? (
            <>
              <Link href="/empleados/importar" className="inline-flex h-10 items-center rounded-ui border border-line-strong bg-surface px-4 font-semibold hover:bg-paper">
                Importar desde Excel
              </Link>
              <Button onClick={() => setCreating(true)}>Nuevo empleado</Button>
            </>
          ) : null
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input
          type="search"
          placeholder="Buscar por nombre, código o documento"
          aria-label="Buscar empleados"
          className="w-full sm:w-80"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <div className="flex flex-wrap gap-1" role="group" aria-label="Estado">
          {FILTERS.map(([value, label]) => (
            <button
              key={value}
              aria-pressed={status === value}
              onClick={() => {
                setStatus(value);
                setPage(1);
              }}
              className={`rounded-full border px-3 py-1 text-sm ${status === value ? 'border-ink bg-ink text-white' : 'border-line-strong bg-surface hover:border-ink'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {list.isPending ? <Spinner /> : null}
      {list.error ? <Notice tone="error" title="No se pudo cargar la lista">{errorMessage(list.error)}</Notice> : null}
      {list.data && list.data.items.length === 0 ? (
        <Empty title={term ? `Nadie coincide con “${term}”` : 'No hay empleados con este estado'}>
          {canManage && !term ? 'Registra el primero con “Nuevo empleado” o carga varios con “Importar desde Excel”.' : null}
        </Empty>
      ) : null}

      {list.data && list.data.items.length > 0 ? (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Nombre</Th>
                <Th>Código</Th>
                <Th>Documento</Th>
                <Th>Cargo</Th>
                <Th>Sede</Th>
                <Th>Estado</Th>
                <Th>App</Th>
              </tr>
            </thead>
            <tbody>
              {list.data.items.map((e) => (
                <tr key={e.id} className="hover:bg-paper/50">
                  <Td>
                    <Link href={`/empleados/${e.id}`} className="font-semibold underline-offset-4 hover:underline">
                      {e.firstName} {e.lastName}
                    </Link>
                  </Td>
                  <Td className="whitespace-nowrap">{e.code}</Td>
                  <Td className="whitespace-nowrap">
                    {e.documentType} {e.documentNumber}
                  </Td>
                  <Td>{e.position?.name ?? '—'}</Td>
                  <Td>{e.defaultStore?.name ?? '—'}</Td>
                  <Td>
                    <Badge tone={EMPLOYEE_STATUS[e.status]?.tone}>{EMPLOYEE_STATUS[e.status]?.label ?? e.status}</Badge>
                  </Td>
                  <Td>{e.hasAppAccess ? 'Sí' : <span className="text-muted">No</span>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <nav className="mt-3 flex items-center justify-between text-sm text-muted" aria-label="Páginas">
            <span>
              {list.data.total} {list.data.total === 1 ? 'persona' : 'personas'}
            </span>
            {list.data.totalPages > 1 ? (
              <span className="flex items-center gap-2">
                <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  Anterior
                </Button>
                Página {list.data.page} de {list.data.totalPages}
                <Button size="sm" variant="secondary" disabled={page >= list.data.totalPages} onClick={() => setPage(page + 1)}>
                  Siguiente
                </Button>
              </span>
            ) : null}
          </nav>
        </>
      ) : null}

      <Dialog open={creating} onClose={() => setCreating(false)} title="Nuevo empleado">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}>
          {create.error ? <Notice tone="error" title={errorMessage(create.error)} /> : null}
          <EmployeeFields value={draft} onChange={setDraft} isNew />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setCreating(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={create.isPending}>
              Registrar empleado
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
