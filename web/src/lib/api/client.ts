import createClient from 'openapi-fetch';

import type { components, paths } from './schema';

export type Schemas = components['schemas'];

/** Cliente tipado del navegador. Todo pasa por el BFF (/api/backend): nunca ve tokens. */
export const api = createClient<paths>({ baseUrl: '/api/backend' });

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

type Result<T> = { data?: T; error?: unknown; response: Response };

/** Devuelve los datos o lanza ApiError con el código estable del backend. */
export async function call<T>(request: Promise<Result<T>>): Promise<T> {
  const { data, error, response } = await request;
  if (response.ok) return data as T;
  const e = (error ?? {}) as { code?: string; message?: string | string[]; details?: Record<string, unknown> };
  if (response.status === 401 && typeof window !== 'undefined') {
    // Recarga completa a propósito: la sesión terminó y se descarta todo el estado del cliente
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `/login?vencida=1&next=${encodeURIComponent(location.pathname)}`;
  }
  throw new ApiError(
    response.status,
    e.code ?? `HTTP_${response.status}`,
    Array.isArray(e.message) ? e.message.join(', ') : (e.message ?? 'Error inesperado del servidor'),
    e.details,
  );
}

/** Descarga un archivo (Excel/PDF) generado por el backend. */
export async function download(path: string, fallbackName: string) {
  const res = await fetch(`/api/backend${path}`);
  if (!res.ok) {
    const e = (await res.json().catch(() => ({}))) as { code?: string; message?: string };
    throw new ApiError(res.status, e.code ?? `HTTP_${res.status}`, e.message ?? 'No se pudo descargar');
  }
  const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

/** Sube un archivo (multipart) por el BFF. */
export async function upload<T>(path: string, file: File): Promise<T> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`/api/backend${path}`, { method: 'POST', body: form });
  const isJson = (res.headers.get('content-type') ?? '').includes('json');
  if (!res.ok) {
    const e = (isJson ? await res.json() : {}) as { code?: string; message?: string; details?: Record<string, unknown> };
    throw new ApiError(res.status, e.code ?? `HTTP_${res.status}`, e.message ?? 'Error al subir el archivo', e.details);
  }
  return (isJson ? await res.json() : await res.blob()) as T;
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof TypeError) return 'Sin conexión con el servidor.';
  return 'Ocurrió un error inesperado.';
}
