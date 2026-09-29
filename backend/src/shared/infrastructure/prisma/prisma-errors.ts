import { Prisma } from '../../../generated/prisma/client';

/** true si el error es una violación de restricción única (P2002). */
export function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}
