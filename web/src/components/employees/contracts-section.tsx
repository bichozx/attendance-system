'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Badge, Button, Dialog, Field, Input, Notice, Select, Spinner, Textarea } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { api, call, errorMessage, type Schemas } from '@/lib/api/client';
import { contractLabel, CONTRACT_TYPES, money } from '@/lib/labels';
import { shortDate, localToday } from '@/lib/time';

type Employee = Schemas['EmployeeResponseDto'];
type ContractDraft = Schemas['CreateContractDto'];

/** Historial de contratos: un aumento o cambio de jornada es un contrato nuevo que cierra el anterior. */
export function ContractsSection({ employee, canManage }: { employee: Employee; canManage: boolean }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const contracts = useQuery({
    queryKey: ['contracts', employee.id],
    queryFn: () => call(api.GET('/employees/{employeeId}/contracts', { params: { path: { employeeId: employee.id } } })),
  });
  const [draft, setDraft] = useState<ContractDraft>({
    contractType: 'INDEFINITE',
    startDate: localToday(),
    endDate: null,
    baseSalary: '',
    weeklyHours: 42,
  });
  const needsEnd = draft.contractType === 'FIXED_TERM' || draft.contractType === 'APPRENTICESHIP';
  const create = useMutation({
    mutationFn: () => call(api.POST('/employees/{employeeId}/contracts', { params: { path: { employeeId: employee.id } }, body: { ...draft, endDate: needsEnd ? draft.endDate : (draft.endDate ?? null) } })),
    onSuccess: (r) => {
      const res = r as { warnings?: string[]; closedPrevious?: { endDate: string } | null };
      toast(res.closedPrevious ? `Contrato registrado; el anterior terminó el ${shortDate(res.closedPrevious.endDate)}` : 'Contrato registrado');
      for (const w of res.warnings ?? []) toast(w, 'error');
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['contracts', employee.id] });
    },
  });

  const list = (contracts.data ?? []) as Schemas['ContractResponseDto'][];

  return (
    <section aria-labelledby="contratos">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="contratos" className="text-lg font-bold">
          Contratos
        </h2>
        {canManage && employee.status !== 'TERMINATED' ? (
          <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
            Nuevo contrato
          </Button>
        ) : null}
      </div>
      {contracts.isPending ? <Spinner /> : null}
      {contracts.error ? <Notice tone="error" title={errorMessage(contracts.error)} /> : null}
      {contracts.data && list.length === 0 ? <p className="text-muted">Sin contratos registrados.</p> : null}
      {list.length ? (
        <ol className="divide-y divide-line rounded-ui border border-line bg-surface">
          {list.map((c) => (
            <li key={c.id} className="px-5 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold">{money(c.baseSalary, c.currency)}</p>
                {c.current ? <Badge tone="working">Vigente</Badge> : null}
              </div>
              <p className="text-[15px]">
                {contractLabel(c.contractType)} · {Number(c.weeklyHours)} h semanales
              </p>
              <p className="text-sm text-muted">
                Desde el {shortDate(c.startDate)}
                {c.endDate ? ` hasta el ${shortDate(c.endDate)}` : ', sin fecha de terminación'}
              </p>
            </li>
          ))}
        </ol>
      ) : null}

      <Dialog open={open} onClose={() => setOpen(false)} title="Nuevo contrato">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}>
          <p className="text-muted">Si hay un contrato vigente, termina el día anterior al inicio de este. Así queda la historia de cada fecha.</p>
          {create.error ? <Notice tone="error" title={errorMessage(create.error)} /> : null}
          <Field label="Tipo de contrato">
            <Select value={draft.contractType} onChange={(e) => setDraft({ ...draft, contractType: e.target.value as ContractDraft['contractType'] })}>
              {CONTRACT_TYPES.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Inicio">
              <Input type="date" required value={draft.startDate} onChange={(e) => setDraft({ ...draft, startDate: e.target.value })} />
            </Field>
            <Field label={needsEnd ? 'Terminación' : 'Terminación (opcional)'}>
              <Input type="date" required={needsEnd} value={draft.endDate ?? ''} onChange={(e) => setDraft({ ...draft, endDate: e.target.value || null })} />
            </Field>
            <Field label="Salario básico mensual" hint="Sin puntos ni signos. Ej: 2300000">
              <Input inputMode="decimal" required pattern="\d{1,12}(\.\d{1,2})?" value={draft.baseSalary} onChange={(e) => setDraft({ ...draft, baseSalary: e.target.value.replace(/[^\d.]/g, '') })} />
            </Field>
            <Field label="Horas semanales">
              <Input type="number" min={1} max={48} required value={draft.weeklyHours} onChange={(e) => setDraft({ ...draft, weeklyHours: Number(e.target.value) })} />
            </Field>
          </div>
          <Field label="Notas (opcional)">
            <Textarea maxLength={500} value={draft.notes ?? ''} onChange={(e) => setDraft({ ...draft, notes: e.target.value || null })} />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" loading={create.isPending}>
              Registrar contrato
            </Button>
          </div>
        </form>
      </Dialog>
    </section>
  );
}
