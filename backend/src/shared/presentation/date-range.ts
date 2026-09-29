import { parseDateOnly } from '../domain/date-only';
import { DomainError } from '../domain/domain-error';

export class InvalidDateRangeError extends DomainError {
  readonly code = 'INVALID_DATE_RANGE';
  readonly kind = 'VALIDATION';
}

const MAX_DAYS = 62;

export function assertRange(from: string, to: string) {
  if (to < from) throw new InvalidDateRangeError('"to" es anterior a "from"');
  const days =
    (parseDateOnly(to).getTime() - parseDateOnly(from).getTime()) / 86_400_000 +
    1;
  if (days > MAX_DAYS)
    throw new InvalidDateRangeError(`El rango máximo es de ${MAX_DAYS} días`);
}
