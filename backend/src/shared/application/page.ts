export interface PageRequest {
  page: number;
  pageSize: number;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function toPage<T>(
  items: T[],
  total: number,
  req: PageRequest,
): Page<T> {
  return {
    items,
    total,
    page: req.page,
    pageSize: req.pageSize,
    totalPages: Math.ceil(total / req.pageSize),
  };
}

/** Convierte page/pageSize en skip/take para Prisma. */
export function toSkipTake(req: PageRequest) {
  return { skip: (req.page - 1) * req.pageSize, take: req.pageSize };
}
