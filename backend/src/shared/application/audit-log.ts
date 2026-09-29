export interface AuditEntry {
  companyId: string | null;
  /** null = acción del sistema (jobs). */
  actorUserId: string | null;
  /** Formato "entidad.accion", ej: "employee.created". */
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
}

/** Registro de auditoría de acciones críticas. Disponible globalmente vía AuditModule. */
export abstract class AuditLog {
  abstract record(entry: AuditEntry): Promise<void>;
}

/** Quién ejecuta una acción dentro de una empresa. */
export interface Actor {
  companyId: string;
  userId: string;
}
