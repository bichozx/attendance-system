'use client';

import { useMutation, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useState } from 'react';

import { Button, Dialog, Empty, Field, Notice, Spinner, Textarea } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { api, ApiError, call, errorMessage, type Schemas } from '@/lib/api/client';

type Change = Schemas['ShiftChangeResponseDto'];
type Page = { items: Change[]; total: number };

const MESSAGES: Record<string, string> = {
  SCHEDULE_CONFLICT: 'El cambio genera un cruce de horario. Resuelve el cruce y vuelve a intentar.',
  EMPLOYEES_NOT_AVAILABLE: 'Una de las personas ya no está disponible (incapacidad, permiso o retiro).',
  SHIFT_CHANGE_STALE: 'Los turnos cambiaron desde la solicitud; quedó cancelada.',
  SHIFT_CHANGE_TOO_LATE: 'El turno ya empezó; la solicitud quedó cancelada.',
  SELF_APPROVAL_FORBIDDEN: 'No puedes aprobar un cambio en el que participas.',
};
const message = (e: unknown) => (e instanceof ApiError && MESSAGES[e.code]) || errorMessage(e);

export function ShiftChangesInbox({ query }: { query: UseQueryResult<Page> }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [rejecting, setRejecting] = useState<Change | null>(null);
  const [notes, setNotes] = useState('');

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['approvals'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };
  const approve = useMutation({
    mutationFn: (id: string) => call(api.POST('/shift-changes/{id}/approve', { params: { path: { id } }, body: {} })),
    onSuccess: (c) => {
      toast(`Aprobado: ${c.requester.firstName} y ${c.peer.firstName} ya tienen sus turnos actualizados`);
      refresh();
    },
    onError: (e) => {
      toast(message(e), 'error');
      refresh();
    },
  });
  const reject = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) =>
      call(api.POST('/shift-changes/{id}/reject', { params: { path: { id } }, body: { notes } })),
    onSuccess: () => {
      setRejecting(null);
      setNotes('');
      toast('Cambio rechazado');
      refresh();
    },
  });

  if (query.isPending) return <Spinner />;
  if (query.error) return <Notice tone="error" title="No se pudieron cargar los cambios">{errorMessage(query.error)}</Notice>;
  if (!query.data?.items.length) {
    return <Empty title="No hay cambios por aprobar">Aquí llegan los cambios de turno que los compañeros ya acordaron entre ellos.</Empty>;
  }

  return (
    <>
      <ul className="divide-y divide-line rounded-ui border border-line bg-surface">
        {query.data.items.map((c) => (
          <li key={c.id} className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
            <div>
              <p className="font-semibold">
                {c.kind === 'SWAP'
                  ? `${c.requester.firstName} ${c.requester.lastName} e ${c.peer.firstName} ${c.peer.lastName} intercambian turnos`
                  : `${c.peer.firstName} ${c.peer.lastName} cubre a ${c.requester.firstName} ${c.requester.lastName}`}
              </p>
              <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 text-[15px]">
                <dt className="text-muted">{c.peer.firstName} toma</dt>
                <dd>
                  {c.shift.description} · {c.shift.storeName}
                </dd>
                {c.peerShift ? (
                  <>
                    <dt className="text-muted">{c.requester.firstName} toma</dt>
                    <dd>
                      {c.peerShift.description} · {c.peerShift.storeName}
                    </dd>
                  </>
                ) : null}
              </dl>
              {c.reason ? <p className="mt-1 text-muted">Motivo: “{c.reason}”</p> : null}
            </div>
            <div className="flex gap-2">
              <Button size="sm" loading={approve.isPending && approve.variables === c.id} onClick={() => approve.mutate(c.id)}>
                Aprobar
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setRejecting(c)}>
                Rechazar
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <Dialog open={!!rejecting} onClose={() => setRejecting(null)} title="Rechazar cambio de turno">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (rejecting) reject.mutate({ id: rejecting.id, notes: notes.trim() });
          }}>
          <p>Las dos personas verán este motivo en la app.</p>
          {reject.error ? <Notice tone="error" title={message(reject.error)} /> : null}
          <Field label="Motivo">
            <Textarea required minLength={3} maxLength={300} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setRejecting(null)}>
              Cancelar
            </Button>
            <Button type="submit" variant="danger" loading={reject.isPending}>
              Rechazar cambio
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
