'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { Button, Empty, Field, Input, Notice, PageHeader, Select, Spinner, Table, Td, Th } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { api, call, download, errorMessage } from '@/lib/api/client';
import { fortnight, month } from './periods';

type Kind = 'attendance' | 'timesheet';

const minutes = (v: number) => `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;

export function ReportsView({ canExport, canFilterStores }: { canExport: boolean; canFilterStores: boolean }) {
  const toast = useToast();
  const now = new Date();
  const presets = [
    { label: 'Esta quincena', ...fortnight(now) },
    { label: 'Quincena anterior', ...fortnight(now, -1) },
    { label: 'Este mes', ...month(now) },
  ];
  const [range, setRange] = useState({ from: presets[0].from, to: presets[0].to });
  const [storeId, setStoreId] = useState('');
  const [downloading, setDownloading] = useState<string | null>(null);

  const stores = useQuery({
    queryKey: ['stores', 'all'],
    queryFn: () => call(api.GET('/stores', { params: { query: { pageSize: 100 } } })),
    enabled: canFilterStores,
  });
  const preview = useQuery({
    queryKey: ['report', 'attendance', range, storeId],
    queryFn: () =>
      call(api.GET('/reports/attendance', { params: { query: { ...range, ...(storeId && { storeId }) } } })),
  });

  async function exportFile(kind: Kind, format: 'xlsx' | 'pdf') {
    const key = `${kind}-${format}`;
    setDownloading(key);
    try {
      const q = new URLSearchParams({ format, ...range, ...(storeId && { storeId }) });
      await download(`/reports/${kind}/export?${q}`, `${kind}.${format}`);
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setDownloading(null);
    }
  }

  const table = preview.data;
  const columns = table?.columns ?? [];

  return (
    <>
      <PageHeader title="Reportes" description="Asistencia del periodo y el consolidado para liquidar la nómina." />

      <div className="mb-6 flex flex-wrap items-end gap-3 rounded-ui border border-line bg-surface p-4">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Periodo">
          {presets.map((p) => (
            <button
              key={p.label}
              aria-pressed={range.from === p.from && range.to === p.to}
              onClick={() => setRange({ from: p.from, to: p.to })}
              className={`rounded-full border px-3 py-1.5 text-sm ${range.from === p.from && range.to === p.to ? 'border-ink bg-ink text-white' : 'border-line-strong hover:border-ink'}`}>
              {p.label}
            </button>
          ))}
        </div>
        <Field label="Desde">
          <Input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
        </Field>
        <Field label="Hasta">
          <Input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
        </Field>
        {canFilterStores && (stores.data?.items.length ?? 0) > 1 ? (
          <Field label="Establecimiento">
            <Select value={storeId} onChange={(e) => setStoreId(e.target.value)}>
              <option value="">Todos</option>
              {stores.data!.items.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
      </div>

      {canExport ? (
        <section className="mb-8 grid gap-4 md:grid-cols-2" aria-label="Descargas">
          <Download
            title="Consolidado para nómina"
            text="Una fila por persona: horas trabajadas, tardanzas y extras (justificadas o no), ausencias, incapacidades y permisos."
            busy={downloading}
            kind="timesheet"
            onExport={exportFile}
          />
          <Download
            title="Detalle de asistencia"
            text="Una fila por jornada: turno, entrada, salida, minutos y novedades aprobadas. Es la tabla de abajo."
            busy={downloading}
            kind="attendance"
            onExport={exportFile}
          />
        </section>
      ) : null}

      <h2 className="mb-3 text-lg font-bold">Detalle de asistencia</h2>
      {preview.isPending ? <Spinner /> : null}
      {preview.error ? <Notice tone="error" title="No se pudo generar el reporte">{errorMessage(preview.error)}</Notice> : null}
      {table && table.rows.length === 0 ? <Empty title="Sin jornadas en este periodo">Prueba con otro rango de fechas o establecimiento.</Empty> : null}
      {table && table.rows.length > 0 ? (
        <>
          {table.truncated ? <Notice tone="warn" title="El periodo tiene demasiadas filas; acórtalo para ver todo." /> : null}
          <Table>
            <thead>
              <tr>
                {columns.map((c) => (
                  <Th key={c.key} className={c.type === 'minutes' || c.type === 'number' ? 'text-right' : ''}>
                    {c.header}
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.slice(0, 300).map((row, i) => (
                <tr key={i}>
                  {columns.map((c) => {
                    const v = (row as Record<string, unknown>)[c.key] as string | number | null;
                    const numeric = c.type === 'minutes' || c.type === 'number';
                    return (
                      <Td key={c.key} className={numeric ? 'text-right whitespace-nowrap' : ['date', 'shift', 'code', 'document'].includes(c.key) ? 'whitespace-nowrap' : ''}>
                        {c.type === 'minutes' && typeof v === 'number' ? minutes(v) : (v ?? '')}
                      </Td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </Table>
          {table.rows.length > 300 ? <p className="mt-2 text-sm text-muted">Se muestran 300 de {table.rows.length} filas. Descarga el archivo para verlas todas.</p> : null}
        </>
      ) : null}
    </>
  );
}

function Download({ title, text, kind, busy, onExport }: { title: string; text: string; kind: Kind; busy: string | null; onExport: (k: Kind, f: 'xlsx' | 'pdf') => void }) {
  return (
    <div className="rounded-ui border border-line bg-surface p-5">
      <h3 className="font-bold">{title}</h3>
      <p className="mt-1 mb-4 text-[15px] text-muted">{text}</p>
      <div className="flex gap-2">
        <Button size="sm" loading={busy === `${kind}-xlsx`} onClick={() => onExport(kind, 'xlsx')}>
          Descargar Excel
        </Button>
        <Button size="sm" variant="secondary" loading={busy === `${kind}-pdf`} onClick={() => onExport(kind, 'pdf')}>
          Descargar PDF
        </Button>
      </div>
    </div>
  );
}
