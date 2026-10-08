'use client';

import { useMutation, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useState } from 'react';

import { Button, Dialog, Empty, Field, Notice, Spinner, Textarea } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { api, call, errorMessage, type Schemas } from '@/lib/api/client';
import { INCIDENT_LABEL } from '@/lib/labels';
import { duration } from '@/lib/time';

type Incident = Schemas['IncidentResponseDto'];
type Page = { items: Incident[]; total: number };

const fmt = (iso: string) =>
  new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' }).format(new Date(iso));
const fmtDay = (iso: string) => new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', timeZone: 'America/Bogota' }).format(new Date(iso));

function when(i: Incident) {
  if (i.type === 'SICK_LEAVE' || (i.type === 'PERMISSION' && !i.minutes)) {
    return i.endsAt ? `${fmtDay(i.startsAt)} al ${fmtDay(new Date(new Date(i.endsAt).getTime() - 1).toISOString())}` : fmtDay(i.startsAt);
  }
  return i.minutes ? `${duration(i.minutes)} · ${fmtDay(i.startsAt)}` : fmt(i.startsAt);
}

export function IncidentsInbox({ query }: { query: UseQueryResult<Page> }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [rejecting, setRejecting] = useState<Incident | null>(null);
  const [notes, setNotes] = useState('');

  const done = (message: string) => {
    toast(message);
    void queryClient.invalidateQueries({ queryKey: ['approvals'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };
  const approve = useMutation({
    mutationFn: (id: string) => call(api.POST('/incidents/{id}/approve', { params: { path: { id } }, body: {} })),
    onSuccess: (r) => done(`Aprobada: ${INCIDENT_LABEL[r.incident.type]} de ${r.incident.employee.firstName}`),
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const reject = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) =>
      call(api.POST('/incidents/{id}/reject', { params: { path: { id } }, body: { notes } })),
    onSuccess: (i) => {
      setRejecting(null);
      setNotes('');
      done(`Rechazada: ${INCIDENT_LABEL[i.type]} de ${i.employee.firstName}`);
    },
  });

  if (query.isPending) return <Spinner />;
  if (query.error) return <Notice tone="error" title="No se pudieron cargar las novedades">{errorMessage(query.error)}</Notice>;
  if (!query.data?.items.length) return <Empty title="No hay novedades pendientes">Las solicitudes que envíen los empleados desde la app aparecerán aquí.</Empty>;

  return (
    <>
      <ul className="divide-y divide-line rounded-ui border border-line bg-surface">
        {query.data.items.map((i) => (
          <li key={i.id} className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
            <div>
              <p className="font-semibold">
                {i.employee.firstName} {i.employee.lastName}
                <span className="font-normal text-muted"> · {INCIDENT_LABEL[i.type] ?? i.type}</span>
              </p>
              <p className="text-[15px]">{when(i)}</p>
              {i.description ? <p className="mt-1 max-w-prose text-muted">“{i.description}”</p> : null}
              <p className="mt-1 text-sm text-muted">Enviada el {fmt(i.createdAt)}</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" loading={approve.isPending && approve.variables === i.id} onClick={() => approve.mutate(i.id)}>
                Aprobar
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setRejecting(i)}>
                Rechazar
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <Dialog open={!!rejecting} onClose={() => setRejecting(null)} title="Rechazar novedad">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (rejecting) reject.mutate({ id: rejecting.id, notes: notes.trim() });
          }}>
          <p>
            {rejecting?.employee.firstName} verá este motivo en la app.
          </p>
          {reject.error ? <Notice tone="error" title={errorMessage(reject.error)} /> : null}
          <Field label="Motivo del rechazo">
            <Textarea required minLength={3} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setRejecting(null)}>
              Cancelar
            </Button>
            <Button type="submit" variant="danger" loading={reject.isPending}>
              Rechazar novedad
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
