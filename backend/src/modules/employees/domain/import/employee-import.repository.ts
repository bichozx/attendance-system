import type { ImportContext, ImportedEmployee } from './employee-import.rules';

export abstract class EmployeeImportRepository {
  abstract context(companyId: string, today: string): Promise<ImportContext>;
  abstract templateLists(
    companyId: string,
  ): Promise<{ positions: string[]; stores: { code: string; name: string }[] }>;
  /** Crea empleados (y sus contratos iniciales) en una sola transacción. Devuelve código → id. */
  abstract createMany(
    companyId: string,
    employees: ImportedEmployee[],
  ): Promise<Map<string, string>>;
  abstract companyTimeZone(companyId: string): Promise<string>;
}
