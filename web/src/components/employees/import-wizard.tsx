'use client';

import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRef, useState } from 'react';

import { Button, Notice, Table, Td, Th } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { download, errorMessage, upload, type Schemas } from '@/lib/api/client';

type Preview = Schemas['ImportPreviewDto'];
type Result = Schemas['ImportResultDto'];

/** Carga masiva en tres pasos: plantilla → validar (no guarda nada) → importar. */
export function ImportWizard() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState<'preview' | 'import' | 'report' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function validate(f: File) {
    setFile(f);
    setPreview(null);
    setResult(null);
    setError(null);
    setBusy('preview');
    try {
      setPreview(await upload<Preview>('/employees/import/preview', f));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function runImport(skipInvalid: boolean) {
    if (!file) return;
    setBusy('import');
    setError(null);
    try {
      const r = await upload<Result>(`/employees/import${skipInvalid ? '?skipInvalid=true' : ''}`, file);
      setResult(r);
      setPreview(null);
      void queryClient.invalidateQueries({ queryKey: ['employees'] });
      toast(`${r.created} empleados importados`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function errorReport() {
    if (!file) return;
    setBusy('report');
    try {
      const blob = await upload<Blob>('/employees/import/preview/report', file);
      const url = URL.createObjectURL(blob);
      Object.assign(document.createElement('a'), { href: url, download: 'empleados-con-errores.xlsx' }).click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <Link href="/empleados" className="text-sm text-muted underline-offset-4 hover:underline">
        Empleados
      </Link>
      <h1 className="mt-1 mb-2 text-[28px] leading-tight font-bold">Importar empleados</h1>
      <p className="mb-8 max-w-2xl text-muted">
        Carga muchas personas a la vez desde Excel o CSV. Primero se revisa todo el archivo; nada se guarda hasta que confirmes.
      </p>

      <ol className="flex max-w-4xl flex-col gap-8">
        <Step n={1} title="Descarga la plantilla">
          <p className="mb-3 text-muted">Trae las columnas, una hoja de instrucciones y los cargos y sedes que ya existen.</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void download('/employees/import/template?format=xlsx', 'plantilla-empleados.xlsx')}>
              Plantilla Excel
            </Button>
            <Button variant="secondary" onClick={() => void download('/employees/import/template?format=csv', 'plantilla-empleados.csv')}>
              Plantilla CSV
            </Button>
          </div>
        </Step>

        <Step n={2} title="Sube el archivo para revisarlo">
          <input
            ref={input}
            type="file"
            accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            onChange={(e) => e.target.files?.[0] && void validate(e.target.files[0])}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => input.current?.click()} loading={busy === 'preview'}>
              {file ? 'Elegir otro archivo' : 'Elegir archivo'}
            </Button>
            {file ? <span className="text-muted">{file.name}</span> : <span className="text-muted">Excel (.xlsx) o CSV, hasta 2.000 filas.</span>}
          </div>
          {error ? (
            <div className="mt-4">
              <Notice tone="error" title={error} />
            </div>
          ) : null}

          {preview ? (
            <div className="mt-5 flex flex-col gap-4">
              <p className="text-lg">
                <strong>{preview.valid}</strong> de {preview.total} filas están listas
                {preview.withContract ? `, ${preview.withContract} con contrato` : ''}
                {preview.withAppAccess ? `, ${preview.withAppAccess} recibirán invitación a la app` : ''}.
              </p>
              {preview.invalid ? (
                <>
                  <Notice tone="warn" title={`${preview.invalid} filas tienen errores`}>
                    Corrígelas en tu archivo y vuelve a subirlo, o descarga el archivo con una columna que explica cada error.
                  </Notice>
                  <Table>
                    <thead>
                      <tr>
                        <Th>Fila</Th>
                        <Th>Código</Th>
                        <Th>Qué corregir</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.errors.slice(0, 50).map((r) => (
                        <tr key={r.row}>
                          <Td>{r.row}</Td>
                          <Td>{r.code || '—'}</Td>
                          <Td>
                            <ul>
                              {r.errors.map((x, i) => (
                                <li key={i}>
                                  <span className="text-muted">{x.field}:</span> {x.message}
                                </li>
                              ))}
                            </ul>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                  {preview.errors.length > 50 ? <p className="text-sm text-muted">Se muestran las primeras 50. El archivo de errores las trae todas.</p> : null}
                  <div>
                    <Button variant="secondary" loading={busy === 'report'} onClick={() => void errorReport()}>
                      Descargar archivo con errores
                    </Button>
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
        </Step>

        <Step n={3} title="Importa">
          {result ? (
            <Notice tone="ok" title={`${result.created} empleados importados`}>
              {result.withContract ? `${result.withContract} con contrato. ` : ''}
              {result.invited ? `${result.invited} invitaciones enviadas por correo para crear su contraseña. ` : ''}
              {result.skipped ? `${result.skipped} filas omitidas por errores. ` : ''}
              {result.warnings.map((w) => (
                <span key={w} className="block">
                  {w}
                </span>
              ))}
            </Notice>
          ) : preview && preview.valid > 0 ? (
            <div className="flex flex-wrap gap-2">
              {preview.invalid === 0 ? (
                <Button loading={busy === 'import'} onClick={() => void runImport(false)}>
                  Importar {preview.valid} empleados
                </Button>
              ) : (
                <Button loading={busy === 'import'} onClick={() => void runImport(true)}>
                  Importar solo las {preview.valid} filas correctas
                </Button>
              )}
            </div>
          ) : (
            <p className="text-muted">Disponible cuando el archivo tenga filas correctas.</p>
          )}
        </Step>
      </ol>
    </>
  );
}

/** Los pasos sí son una secuencia: por eso van numerados. */
function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-4">
      <span className="flex size-9 items-center justify-center rounded-full border-2 border-ink font-bold" aria-hidden>
        {n}
      </span>
      <div>
        <h2 className="mb-2 text-lg font-bold">
          <span className="sr-only">Paso {n}: </span>
          {title}
        </h2>
        {children}
      </div>
    </li>
  );
}
