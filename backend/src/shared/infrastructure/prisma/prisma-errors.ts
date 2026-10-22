import { Prisma } from '../../../generated/prisma/client';

/**
 * Fallas pasajeras de conexión con la base (Postgres reiniciándose, red caída, el equipo
 * saliendo de suspensión, sin conexiones libres a tiempo). Un proceso periódico que choca
 * con una de estas no está roto: en el siguiente ciclo vuelve a intentar.
 */
const TRANSIENT_PRISMA_CODES = new Set([
  'P1001', // no se pudo conectar
  'P1002', // tiempo de espera de conexión agotado
  'P1008', // operación agotó el tiempo
  'P1017', // el servidor cerró la conexión
  'P2024', // sin conexiones libres en el pool a tiempo
  'P2028', // no se pudo iniciar la transacción a tiempo
]);
const TRANSIENT_NODE_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EPIPE',
  '57P01', // Postgres: admin_shutdown
]);

/** Lo que el adaptador de Postgres reporta dentro de un P2010 (consulta SQL directa). */
const TRANSIENT_ADAPTER_KINDS = new Set([
  'DatabaseNotReachable',
  'ConnectionClosed',
  'SocketTimeout',
  'TooManyConnections',
  'TransactionStartTimeout',
]);

export function isTransientDbError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (TRANSIENT_PRISMA_CODES.has(error.code)) return true;
    const kind = (
      error.meta as
        { driverAdapterError?: { cause?: { kind?: string } } } | undefined
    )?.driverAdapterError?.cause?.kind;
    if (kind && TRANSIENT_ADAPTER_KINDS.has(kind)) return true;
  }
  if (error instanceof Prisma.PrismaClientInitializationError) return true;
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && TRANSIENT_NODE_CODES.has(code);
}

/** Mensaje corto para el log, sin la traza completa. */
export function shortDbError(error: unknown): string {
  const e = error as { code?: string; message?: string };
  const first = (e?.message ?? String(error))
    .trim()
    .split('\n')
    .filter(Boolean)
    .at(-1);
  return `${e?.code ? `${e.code}: ` : ''}${first ?? ''}`.slice(0, 200);
}

/** true si el error es una violación de restricción única (P2002). */
export function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}
