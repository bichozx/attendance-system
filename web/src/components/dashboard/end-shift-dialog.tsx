'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Button, Dialog, Field, Notice, Textarea } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { api, call, errorMessage, type Schemas } from '@/lib/api/client';
import { clock } from '@/lib/time';

type Person = Schemas['DashboardPersonDto'];

const REASONS = ['Baja venta, se envía a casa', 'Cierre temprano del local', 'Se siente mal'];

/**
 * Terminar ahora la jornada de quien está trabajando. La salida la pone el servidor con
 * su hora (no la del navegador), el motivo queda en el historial y el empleado recibe un aviso.
 */
export function EndShiftDialog({ person, timeZone, onClose }: { person: Person | null; timeZone: string; onClose: () => void }) {
  return (
    <Dialog open={person !== null} onClose={onClose} title="Terminar jornada">
      {/* Se monta de nuevo para cada persona: el motivo empieza vacío */}
      {person ? <EndShiftForm key={person.attendanceId} person={person} timeZone={timeZone} onDone={onClose} /> : null}
    </Dialog>
  );
}

function EndShiftForm({ person: p, timeZone, onDone }: { person: Person; timeZone: string; onDone: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const end = useMutation({
    mutationFn: () => call(api.POST('/attendance/{id}/end', { params: { path: { id: p.attendanceId! } }, body: { reason: reason.trim() } })),
    onSuccess: (a) => {
      toast(`Jornada de ${p.name} terminada a las ${clock(a.clockOutAt!, timeZone)}`);
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['approvals'] });
      onDone();
    },
  });

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        end.mutate();
      }}>
      {end.error ? <Notice tone="error" title={errorMessage(end.error)} /> : null}
      <div>
        <p className="text-lg font-semibold">{p.name}</p>
        <p className="text-muted">
          Entró a las {p.clockInAt ? clock(p.clockInAt, timeZone) : '—'} · su turno es hasta las {p.shiftEnd} · {p.storeName}
        </p>
      </div>
      <p>Se registrará su salida con la hora de este momento y se le avisará en la app.</p>
      <Field label="Motivo" hint="Queda en el historial y se le muestra al empleado.">
        <Textarea required minLength={5} maxLength={200} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Motivos frecuentes">
        {REASONS.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setReason(r)}
            className="rounded-full border border-line-strong bg-surface px-3 py-1 text-sm hover:border-ink">
            {r}
          </button>
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" variant="danger" loading={end.isPending} disabled={reason.trim().length < 5}>
          Terminar jornada
        </Button>
      </div>
    </form>
  );
}
