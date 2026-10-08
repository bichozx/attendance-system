'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button, Field, Input, Notice, PageHeader, Select, Spinner } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { api, call, errorMessage, type Schemas } from '@/lib/api/client';
import { ZONES } from '@/lib/zones';

type Company = Schemas['CompanyResponseDto'];

export function CompanySettings({ canUpdate }: { canUpdate: boolean }) {
  const company = useQuery({ queryKey: ['company'], queryFn: () => call(api.GET('/company', {})) });
  if (company.isPending) return <Spinner />;
  if (company.error) return <Notice tone="error" title="No se pudo cargar">{errorMessage(company.error)}</Notice>;
  return <CompanyForm key={company.data.updatedAt} company={company.data} canUpdate={canUpdate} />;
}

function CompanyForm({ company, canUpdate }: { company: Company; canUpdate: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [name, setName] = useState(company.name);
  const [legalName, setLegalName] = useState(company.legalName ?? '');
  const [timezone, setTimezone] = useState(company.timezone);
  const [early, setEarly] = useState(company.shiftDefaults.earlyClockInMinutes);
  const [late, setLate] = useState(company.shiftDefaults.lateToleranceMinutes);
  const [breakMinutes, setBreak] = useState(company.shiftDefaults.breakMinutes);
  const zones = ZONES.some(([z]) => z === company.timezone) ? ZONES : [[company.timezone, company.timezone] as [string, string], ...ZONES];

  const save = useMutation({
    mutationFn: () =>
      call(
        api.PATCH('/company', {
          body: {
            name: name.trim(),
            legalName: legalName.trim() || null,
            timezone,
            shiftDefaults: { earlyClockInMinutes: early, lateToleranceMinutes: late, breakMinutes },
          },
        }),
      ),
    onSuccess: (c) => {
      toast('Configuración guardada');
      queryClient.setQueryData(['company'], c);
      // El nombre aparece en la barra lateral (componente de servidor)
      if (c.name !== company.name) router.refresh();
    },
  });

  const exampleStart = 8 * 60;
  const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

  return (
    <>
      <PageHeader title="Empresa" description="Datos generales y reglas por defecto para los turnos nuevos." />
      <form
        className="flex max-w-3xl flex-col gap-6"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}>
        {save.error ? <Notice tone="error" title={errorMessage(save.error)} /> : null}
        <fieldset disabled={!canUpdate} className="flex flex-col gap-4 rounded-ui border border-line bg-surface p-5">
          <legend className="px-1 font-semibold">Datos generales</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre comercial">
              <Input required minLength={2} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Razón social">
              <Input maxLength={160} value={legalName} onChange={(e) => setLegalName(e.target.value)} />
            </Field>
          </div>
          <Field label="Zona horaria" hint="Cambia cómo se muestran las horas en reportes y en el panel. Los turnos ya guardados no se mueven.">
            <Select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
              {zones.map(([z, label]) => (
                <option key={z} value={z}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-muted">NIT</dt>
              <dd className="font-semibold">{company.taxId ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-muted">País</dt>
              <dd className="font-semibold">{company.country}</dd>
            </div>
            <div>
              <dt className="text-muted">Moneda</dt>
              <dd className="font-semibold">{company.currency}</dd>
            </div>
            <div>
              <dt className="text-muted">Identificador</dt>
              <dd className="font-semibold">{company.slug}</dd>
            </div>
          </dl>
          <p className="text-sm text-muted">El NIT, el país y la moneda los cambia el administrador de la plataforma.</p>
        </fieldset>

        <fieldset disabled={!canUpdate} className="flex flex-col gap-4 rounded-ui border border-line bg-surface p-5">
          <legend className="px-1 font-semibold">Turnos nuevos</legend>
          <p className="text-sm text-muted">Se aplican al crear un turno sin indicar otros valores. Los turnos existentes conservan los suyos.</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Puede marcar antes (min)">
              <Input type="number" min={0} max={120} required value={early} onChange={(e) => setEarly(Number(e.target.value))} />
            </Field>
            <Field label="Tolerancia de llegada (min)">
              <Input type="number" min={0} max={60} required value={late} onChange={(e) => setLate(Number(e.target.value))} />
            </Field>
            <Field label="Descanso (min)">
              <Input type="number" min={0} max={240} required value={breakMinutes} onChange={(e) => setBreak(Number(e.target.value))} />
            </Field>
          </div>
          <p className="rounded-ui bg-paper px-4 py-3 text-sm">
            Ejemplo, turno de 08:00: puede marcar desde las <strong>{hhmm(exampleStart - early)}</strong>; llegar después de las{' '}
            <strong>{hhmm(exampleStart + late)}</strong> cuenta como tardanza
            {breakMinutes ? (
              <>
                {' '}
                y se descuentan <strong>{breakMinutes} min</strong> de descanso
              </>
            ) : null}
            .
          </p>
        </fieldset>

        {canUpdate ? (
          <div>
            <Button type="submit" loading={save.isPending}>
              Guardar cambios
            </Button>
          </div>
        ) : null}
      </form>
    </>
  );
}
