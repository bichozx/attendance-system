import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PageRequest, toSkipTake } from '../../../shared/application/page';
import { parseDateOnly } from '../../../shared/domain/date-only';
import { utcToLocal } from '../../../shared/domain/zoned-time';
import { isUniqueViolation } from '../../../shared/infrastructure/prisma/prisma-errors';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { IdempotencyKeyReusedError } from '../domain/attendance.errors';
import {
  Adjustment,
  AttendanceDetail,
  AttendanceFilter,
  AttendanceListItem,
  AttendanceRecord,
  AttendanceRepository,
  AttendanceUnitOfWork,
  ClockingEmployee,
  Fix,
  NewEvent,
  OverdueResult,
  StoredEvent,
} from '../domain/attendance.repository';
import type {
  ReviewReason,
  ShiftForClock,
  WorkMetrics,
} from '../domain/attendance.types';

type Client = PrismaService | Prisma.TransactionClient;

const HOUR = 3_600_000;

// ---------------------------------------------------------------------
// Selects y mapeos
// ---------------------------------------------------------------------

const SHIFT_SELECT = {
  id: true,
  storeId: true,
  startsAt: true,
  endsAt: true,
  breakMinutes: true,
  earlyClockInMinutes: true,
  lateToleranceMinutes: true,
  status: true,
  store: {
    select: {
      name: true,
      timezone: true,
      company: { select: { timezone: true } },
    },
  },
} satisfies Prisma.ShiftSelect;

type ShiftRow = Prisma.ShiftGetPayload<{ select: typeof SHIFT_SELECT }>;

const ATTENDANCE_SELECT = {
  id: true,
  shiftAssignmentId: true,
  employeeId: true,
  workDate: true,
  status: true,
  clockInAt: true,
  clockOutAt: true,
  lateMinutes: true,
  earlyLeaveMinutes: true,
  workedMinutes: true,
  overtimeMinutes: true,
  needsReview: true,
  reviewReasons: true,
} satisfies Prisma.AttendanceSelect;

function toShift(
  assignmentId: string,
  s: ShiftRow,
  attendance: ShiftForClock['attendance'],
): ShiftForClock {
  return {
    assignmentId,
    shiftId: s.id,
    storeId: s.storeId,
    storeName: s.store.name,
    timeZone: s.store.timezone ?? s.store.company.timezone,
    startsAt: s.startsAt,
    endsAt: s.endsAt,
    breakMinutes: s.breakMinutes,
    earlyClockInMinutes: s.earlyClockInMinutes,
    lateToleranceMinutes: s.lateToleranceMinutes,
    status: s.status,
    attendance,
  };
}

const EVENT_SELECT = {
  id: true,
  employeeId: true,
  type: true,
  result: true,
  rejectionReason: true,
  source: true,
  serverTimestamp: true,
  distanceMeters: true,
  accuracyMeters: true,
  withinGeofence: true,
  attendance: {
    select: {
      ...ATTENDANCE_SELECT,
      shiftAssignment: { select: { shiftId: true } },
    },
  },
} satisfies Prisma.AttendanceEventSelect;

type EventRow = Prisma.AttendanceEventGetPayload<{
  select: typeof EVENT_SELECT;
}>;

const EVENT_DETAIL_SELECT = {
  id: true,
  employeeId: true,
  type: true,
  result: true,
  rejectionReason: true,
  source: true,
  serverTimestamp: true,
  clientTimestamp: true,
  receivedAt: true,
  clockDriftSeconds: true,
  latitude: true,
  longitude: true,
  accuracyMeters: true,
  distanceMeters: true,
  withinGeofence: true,
  deviceInfo: true,
  createdById: true,
} satisfies Prisma.AttendanceEventSelect;

function toEvent({ attendance, ...e }: EventRow): StoredEvent {
  return {
    ...e,
    attendance: attendance
      ? (({ shiftAssignment, ...a }) => ({
          ...a,
          shiftId: shiftAssignment.shiftId,
        }))(attendance)
      : null,
  };
}

const LIST_SELECT = {
  ...ATTENDANCE_SELECT,
  reviewedAt: true,
  employee: {
    select: { id: true, code: true, firstName: true, lastName: true },
  },
  shiftAssignment: { select: { id: true, shift: { select: SHIFT_SELECT } } },
} satisfies Prisma.AttendanceSelect;

type ListRow = Prisma.AttendanceGetPayload<{ select: typeof LIST_SELECT }>;

function toListItem({ shiftAssignment, ...row }: ListRow): AttendanceListItem {
  return {
    ...row,
    shift: toShift(shiftAssignment.id, shiftAssignment.shift, {
      id: row.id,
      clockInAt: row.clockInAt,
      status: row.status,
    }),
  };
}

/** Turnos visibles para el empleado (periodo publicado/cerrado, o sin periodo). */
const VISIBLE = {
  OR: [
    { schedulePeriodId: null },
    { schedulePeriod: { status: { not: 'DRAFT' } } },
  ],
} satisfies Prisma.ShiftWhereInput;

const unique = (values: string[]) => [...new Set(values)];

// ---------------------------------------------------------------------
// Unidad de trabajo (dentro o fuera de transacción)
// ---------------------------------------------------------------------

class PrismaAttendanceUow implements AttendanceUnitOfWork {
  constructor(
    private readonly db: Client,
    private readonly companyId: string,
  ) {}

  async findShiftsAround(
    employeeId: string,
    at: Date,
  ): Promise<ShiftForClock[]> {
    const rows = await this.db.shiftAssignment.findMany({
      where: {
        companyId: this.companyId,
        employeeId,
        status: 'ASSIGNED',
        shift: {
          ...VISIBLE,
          startsAt: { lt: new Date(at.getTime() + 24 * HOUR) },
          endsAt: { gt: new Date(at.getTime() - 12 * HOUR) },
        },
      },
      select: {
        id: true,
        shift: { select: SHIFT_SELECT },
        attendance: { select: { id: true, clockInAt: true, status: true } },
      },
    });
    return rows.map((r) => toShift(r.id, r.shift, r.attendance));
  }

  async findOpenAttendance(employeeId: string) {
    const row = await this.db.attendance.findFirst({
      where: { companyId: this.companyId, employeeId, status: 'IN_PROGRESS' },
      orderBy: { clockInAt: 'desc' },
      select: {
        ...ATTENDANCE_SELECT,
        shiftAssignment: {
          select: { id: true, shift: { select: SHIFT_SELECT } },
        },
      },
    });
    if (!row) return null;
    const { shiftAssignment, ...attendance } = row;
    return {
      attendance,
      shift: toShift(shiftAssignment.id, shiftAssignment.shift, {
        id: attendance.id,
        clockInAt: attendance.clockInAt,
        status: attendance.status,
      }),
    };
  }

  async findEventByKey(key: string): Promise<StoredEvent | null> {
    const row = await this.db.attendanceEvent.findUnique({
      where: {
        companyId_idempotencyKey: {
          companyId: this.companyId,
          idempotencyKey: key,
        },
      },
      select: EVENT_SELECT,
    });
    return row ? toEvent(row) : null;
  }

  async recordClockIn(data: {
    shift: ShiftForClock;
    employeeId: string;
    workDate: Date;
    at: Date;
    fix: Fix;
    lateMinutes: number;
    reviewReasons: ReviewReason[];
  }): Promise<AttendanceRecord> {
    const values = {
      status: 'IN_PROGRESS' as const,
      clockInAt: data.at,
      clockInLatitude: data.fix.latitude,
      clockInLongitude: data.fix.longitude,
      clockInAccuracy: data.fix.accuracyMeters,
      lateMinutes: data.lateMinutes,
      needsReview: data.reviewReasons.length > 0,
      reviewReasons: data.reviewReasons,
    };
    return this.db.attendance.upsert({
      where: { shiftAssignmentId: data.shift.assignmentId },
      create: {
        ...values,
        companyId: this.companyId,
        shiftAssignmentId: data.shift.assignmentId,
        employeeId: data.employeeId,
        workDate: data.workDate,
      },
      update: values,
      select: ATTENDANCE_SELECT,
    });
  }

  async recordClockOut(
    attendanceId: string,
    data: {
      at: Date;
      fix: Fix;
      metrics: WorkMetrics;
      reviewReasons: ReviewReason[];
    },
  ): Promise<AttendanceRecord> {
    const current = await this.db.attendance.findUniqueOrThrow({
      where: { id: attendanceId },
      select: { reviewReasons: true, needsReview: true },
    });
    return this.db.attendance.update({
      where: { id: attendanceId },
      data: {
        status: 'COMPLETED',
        clockOutAt: data.at,
        clockOutLatitude: data.fix.latitude,
        clockOutLongitude: data.fix.longitude,
        clockOutAccuracy: data.fix.accuracyMeters,
        ...data.metrics,
        needsReview: current.needsReview || data.reviewReasons.length > 0,
        reviewReasons: unique([
          ...current.reviewReasons,
          ...data.reviewReasons,
        ]),
      },
      select: ATTENDANCE_SELECT,
    });
  }

  async saveEvent(event: NewEvent): Promise<StoredEvent> {
    try {
      const row = await this.db.attendanceEvent.create({
        data: {
          ...event,
          companyId: this.companyId,
          deviceInfo: (event.deviceInfo ?? undefined) as
            Prisma.InputJsonValue | undefined,
        },
        select: EVENT_SELECT,
      });
      return toEvent(row);
    } catch (error) {
      // La misma clave la usó otro empleado de la empresa
      if (isUniqueViolation(error)) throw new IdempotencyKeyReusedError();
      throw error;
    }
  }
}

// ---------------------------------------------------------------------
// Repositorio
// ---------------------------------------------------------------------

@Injectable()
export class PrismaAttendanceRepository extends AttendanceRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  findEmployeeByUser(
    companyId: string,
    userId: string,
  ): Promise<ClockingEmployee | null> {
    return this.prisma.employee.findFirst({
      where: { companyId, userId, deletedAt: null },
      select: { id: true, status: true, firstName: true, lastName: true },
    });
  }

  findEventByKey(companyId: string, key: string) {
    return new PrismaAttendanceUow(this.prisma, companyId).findEventByKey(key);
  }

  inEmployeeLock<T>(
    companyId: string,
    employeeId: string,
    work: (uow: AttendanceUnitOfWork) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`attendance-employee:${employeeId}`}, 0))`;
        return work(new PrismaAttendanceUow(tx, companyId));
      },
      { timeout: 15_000 },
    );
  }

  reader(companyId: string) {
    return new PrismaAttendanceUow(this.prisma, companyId);
  }

  async list(companyId: string, filter: AttendanceFilter, page: PageRequest) {
    const where: Prisma.AttendanceWhereInput = {
      companyId,
      workDate: { gte: filter.from, lte: filter.to },
      employeeId: filter.employeeId,
      status: filter.status,
      needsReview: filter.needsReview,
      ...(filter.storeId && {
        shiftAssignment: { shift: { storeId: filter.storeId } },
      }),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.attendance.findMany({
        where,
        select: LIST_SELECT,
        orderBy: [{ workDate: 'desc' }, { employee: { firstName: 'asc' } }],
        ...toSkipTake(page),
      }),
      this.prisma.attendance.count({ where }),
    ]);
    return { items: rows.map(toListItem), total };
  }

  async findDetail(
    companyId: string,
    id: string,
  ): Promise<AttendanceDetail | null> {
    const row = await this.prisma.attendance.findFirst({
      where: { id, companyId },
      select: {
        ...LIST_SELECT,
        events: {
          orderBy: { serverTimestamp: 'asc' },
          select: EVENT_DETAIL_SELECT,
        },
      },
    });
    if (!row) return null;
    const { events, ...rest } = row;
    const item = toListItem(rest);

    // Intentos rechazados ANTES de existir la asistencia (fuera del local, GPS falso...):
    // quedaron sin attendanceId, pero son evidencia de esta misma jornada.
    const shift = item.shift;
    const earlier = await this.prisma.attendanceEvent.findMany({
      where: {
        companyId,
        employeeId: item.employeeId,
        attendanceId: null,
        type: 'CLOCK_IN',
        serverTimestamp: {
          gte: new Date(
            shift.startsAt.getTime() -
              (shift.earlyClockInMinutes + 60) * 60_000,
          ),
          lt: shift.endsAt,
        },
      },
      orderBy: { serverTimestamp: 'asc' },
      select: EVENT_DETAIL_SELECT,
    });

    return {
      ...item,
      events: [...earlier, ...events].sort(
        (a, b) => a.serverTimestamp.getTime() - b.serverTimestamp.getTime(),
      ),
    };
  }

  async applyAdjustment(
    companyId: string,
    id: string,
    adj: Adjustment,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.attendance.findFirstOrThrow({
        where: { id, companyId },
        select: { employeeId: true },
      });
      const now = new Date();
      await tx.attendance.update({
        where: { id },
        data: {
          status: adj.status,
          clockInAt: adj.clockInAt,
          clockOutAt: adj.clockOutAt,
          ...adj.metrics,
          needsReview: false,
          reviewedAt: now,
          reviewedById: adj.actorUserId,
        },
      });
      await tx.attendanceEvent.create({
        data: {
          companyId,
          employeeId: current.employeeId,
          attendanceId: id,
          type: 'MANUAL_ADJUSTMENT',
          result: 'ACCEPTED',
          source: 'ADMIN_PANEL',
          serverTimestamp: now,
          createdById: adj.actorUserId,
          deviceInfo: JSON.parse(
            JSON.stringify({
              reason: adj.reason,
              before: adj.before,
              after: {
                clockInAt: adj.clockInAt,
                clockOutAt: adj.clockOutAt,
                status: adj.status,
              },
            }),
          ) as Prisma.InputJsonValue,
        },
      });
    });
  }

  async markReviewed(
    companyId: string,
    id: string,
    actorUserId: string,
  ): Promise<void> {
    await this.prisma.attendance.updateMany({
      where: { id, companyId },
      data: {
        needsReview: false,
        reviewedAt: new Date(),
        reviewedById: actorUserId,
      },
    });
  }

  async closeOverdue(
    now: Date,
    clockOutGraceMinutes: number,
  ): Promise<OverdueResult> {
    return this.prisma.$transaction(
      async (tx) => {
        // Si otra instancia del backend lo está ejecutando, no hace nada
        const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`
          SELECT pg_try_advisory_xact_lock(hashtextextended('attendance-closing-job', 0)) AS locked`;
        if (!locked) return { incomplete: [], absent: 0, ran: false };

        // 1) Con entrada y sin salida, ya pasó la ventana de salida → INCOMPLETE
        const cutoff = new Date(now.getTime() - clockOutGraceMinutes * 60_000);
        const open = await tx.attendance.findMany({
          where: {
            status: 'IN_PROGRESS',
            shiftAssignment: { shift: { endsAt: { lt: cutoff } } },
          },
          select: {
            id: true,
            companyId: true,
            reviewReasons: true,
            employee: { select: { userId: true } },
            shiftAssignment: { select: { shift: { select: SHIFT_SELECT } } },
          },
          take: 500,
        });
        for (const a of open) {
          await tx.attendance.update({
            where: { id: a.id },
            data: {
              status: 'INCOMPLETE',
              needsReview: true,
              reviewReasons: unique([...a.reviewReasons, 'MISSING_CLOCK_OUT']),
            },
          });
        }

        // 2) Turno terminado sin ninguna entrada → ABSENT (últimos 7 días)
        const missing = await tx.shiftAssignment.findMany({
          where: {
            status: 'ASSIGNED',
            attendance: { is: null },
            shift: {
              ...VISIBLE,
              status: 'SCHEDULED',
              endsAt: { lt: now, gt: new Date(now.getTime() - 7 * 24 * HOUR) },
            },
          },
          select: {
            id: true,
            companyId: true,
            employeeId: true,
            shift: { select: SHIFT_SELECT },
          },
          take: 1_000,
        });
        const { count } = await tx.attendance.createMany({
          data: missing.map((m) => ({
            companyId: m.companyId,
            shiftAssignmentId: m.id,
            employeeId: m.employeeId,
            workDate: parseDateOnly(
              utcToLocal(
                m.shift.startsAt,
                m.shift.store.timezone ?? m.shift.store.company.timezone,
              ).date,
            ),
            status: 'ABSENT' as const,
            needsReview: true,
            reviewReasons: ['NO_CLOCK_IN'],
          })),
          skipDuplicates: true,
        });

        return {
          ran: true,
          absent: count,
          incomplete: open.map((a) => ({
            companyId: a.companyId,
            userId: a.employee.userId,
            shiftStartsAt: a.shiftAssignment.shift.startsAt,
            timeZone:
              a.shiftAssignment.shift.store.timezone ??
              a.shiftAssignment.shift.store.company.timezone,
          })),
        };
      },
      { timeout: 60_000 },
    );
  }
}
