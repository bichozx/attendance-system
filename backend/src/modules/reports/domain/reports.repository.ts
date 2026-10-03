import type { PageRequest } from '../../../shared/application/page';
import type { LiveInput } from './live-status';

export interface DashboardRow extends LiveInput {
  assignmentId: string;
  employee: { id: string; code: string; firstName: string; lastName: string };
  store: { id: string; name: string };
  timeZone: string;
}

export interface AttendanceDetailRow {
  workDate: Date;
  employee: {
    code: string;
    firstName: string;
    lastName: string;
    documentNumber: string;
  };
  storeName: string;
  timeZone: string;
  shiftStartsAt: Date;
  shiftEndsAt: Date;
  scheduledMinutes: number;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'INCOMPLETE' | 'ABSENT';
  clockInAt: Date | null;
  clockOutAt: Date | null;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  workedMinutes: number;
  overtimeMinutes: number;
  needsReview: boolean;
  /** Tipos de novedades APROBADAS que la justifican (incluye incapacidad/permiso que la cubre). */
  justifications: string[];
}

export interface AttendanceDetailFilter {
  from: Date;
  to: Date;
  storeId?: string;
  employeeId?: string;
  status?: AttendanceDetailRow['status'];
}

export interface AuditItem {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actor: { id: string; name: string; email: string } | null;
  before: unknown;
  after: unknown;
  createdAt: Date;
}

export interface AuditFilter {
  from?: Date;
  to?: Date;
  /** Prefijo: "employee." trae todas las acciones sobre empleados. */
  action?: string;
  entityType?: string;
  entityId?: string;
  actorUserId?: string;
}

export abstract class ReportsRepository {
  abstract company(
    companyId: string,
  ): Promise<{ name: string; timezone: string }>;
  abstract dashboardRows(
    companyId: string,
    from: Date,
    to: Date,
    storeId?: string,
  ): Promise<DashboardRow[]>;
  abstract pendingCounts(companyId: string): Promise<{
    attendanceToReview: number;
    incidentsToApprove: number;
    shiftChangesToApprove: number;
  }>;
  abstract attendanceDetail(
    companyId: string,
    filter: AttendanceDetailFilter,
    limit: number,
  ): Promise<{ rows: AttendanceDetailRow[]; truncated: boolean }>;
  abstract storeName(
    companyId: string,
    storeId: string,
  ): Promise<string | null>;
  abstract audit(
    companyId: string,
    filter: AuditFilter,
    page: PageRequest,
  ): Promise<{ items: AuditItem[]; total: number }>;
}
