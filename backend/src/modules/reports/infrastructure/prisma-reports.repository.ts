import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { PageRequest, toSkipTake } from '../../../shared/application/page';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import {
  AttendanceDetailFilter,
  AttendanceDetailRow,
  AuditFilter,
  DashboardRow,
  ReportsRepository,
} from '../domain/reports.repository';

const STORE_TZ = {
  select: {
    name: true,
    timezone: true,
    company: { select: { timezone: true } },
  },
} as const;
const tzOf = (s: { timezone: string | null; company: { timezone: string } }) =>
  s.timezone ?? s.company.timezone;

@Injectable()
export class PrismaReportsRepository extends ReportsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  company(companyId: string) {
    return this.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { name: true, timezone: true },
    });
  }

  async storeName(companyId: string, storeId: string) {
    const s = await this.prisma.store.findFirst({
      where: { id: storeId, companyId },
      select: { name: true },
    });
    return s?.name ?? null;
  }

  async dashboardRows(
    companyId: string,
    from: Date,
    to: Date,
    storeId?: string,
  ): Promise<DashboardRow[]> {
    const rows = await this.prisma.shiftAssignment.findMany({
      where: {
        companyId,
        status: 'ASSIGNED',
        shift: {
          status: 'SCHEDULED',
          storeId,
          startsAt: { lt: to },
          endsAt: { gt: from },
          OR: [
            { schedulePeriodId: null },
            { schedulePeriod: { status: { not: 'DRAFT' } } },
          ],
        },
      },
      select: {
        id: true,
        employee: {
          select: { id: true, code: true, firstName: true, lastName: true },
        },
        attendance: {
          select: { status: true, clockInAt: true, lateMinutes: true },
        },
        shift: {
          select: {
            startsAt: true,
            endsAt: true,
            lateToleranceMinutes: true,
            store: { select: { id: true, ...STORE_TZ.select } },
          },
        },
      },
      orderBy: [
        { shift: { startsAt: 'asc' } },
        { employee: { firstName: 'asc' } },
      ],
      take: 2_000,
    });

    const timeOff = await this.approvedTimeOff(
      companyId,
      [...new Set(rows.map((r) => r.employee.id))],
      from,
      to,
    );
    return rows.map((r) => ({
      assignmentId: r.id,
      employee: r.employee,
      store: { id: r.shift.store.id, name: r.shift.store.name },
      timeZone: tzOf(r.shift.store),
      startsAt: r.shift.startsAt,
      endsAt: r.shift.endsAt,
      lateToleranceMinutes: r.shift.lateToleranceMinutes,
      attendance: r.attendance,
      onTimeOff: timeOff.some(
        (t) =>
          t.employeeId === r.employee.id &&
          t.startsAt < r.shift.endsAt &&
          r.shift.startsAt < t.endsAt!,
      ),
    }));
  }

  async pendingCounts(companyId: string) {
    const [attendanceToReview, incidentsToApprove, shiftChangesToApprove] =
      await this.prisma.$transaction([
        this.prisma.attendance.count({
          where: { companyId, needsReview: true },
        }),
        this.prisma.incident.count({ where: { companyId, status: 'PENDING' } }),
        this.prisma.shiftChange.count({
          where: {
            companyId,
            isRequest: true,
            status: 'PENDING',
            peerAccepted: true,
          },
        }),
      ]);
    return { attendanceToReview, incidentsToApprove, shiftChangesToApprove };
  }

  async attendanceDetail(
    companyId: string,
    f: AttendanceDetailFilter,
    limit: number,
  ) {
    const rows = await this.prisma.attendance.findMany({
      where: {
        companyId,
        workDate: { gte: f.from, lte: f.to },
        employeeId: f.employeeId,
        status: f.status,
        ...(f.storeId && {
          shiftAssignment: { shift: { storeId: f.storeId } },
        }),
      },
      select: {
        id: true,
        workDate: true,
        status: true,
        clockInAt: true,
        clockOutAt: true,
        lateMinutes: true,
        earlyLeaveMinutes: true,
        workedMinutes: true,
        overtimeMinutes: true,
        needsReview: true,
        employee: {
          select: {
            id: true,
            code: true,
            firstName: true,
            lastName: true,
            documentNumber: true,
          },
        },
        incidents: { where: { status: 'APPROVED' }, select: { type: true } },
        shiftAssignment: {
          select: {
            shift: {
              select: {
                startsAt: true,
                endsAt: true,
                breakMinutes: true,
                store: STORE_TZ,
              },
            },
          },
        },
      },
      orderBy: [
        { workDate: 'asc' },
        { employee: { firstName: 'asc' } },
        { employee: { lastName: 'asc' } },
      ],
      take: limit + 1,
    });
    const truncated = rows.length > limit;
    const kept = rows.slice(0, limit);

    const from = kept.length
      ? new Date(
          Math.min(
            ...kept.map((r) => r.shiftAssignment.shift.startsAt.getTime()),
          ),
        )
      : f.from;
    const to = kept.length
      ? new Date(
          Math.max(
            ...kept.map((r) => r.shiftAssignment.shift.endsAt.getTime()),
          ),
        )
      : f.to;
    const timeOff = await this.approvedTimeOff(
      companyId,
      [...new Set(kept.map((r) => r.employee.id))],
      from,
      to,
    );

    const result: AttendanceDetailRow[] = kept.map((r) => {
      const s = r.shiftAssignment.shift;
      const covering = timeOff
        .filter(
          (t) =>
            t.employeeId === r.employee.id &&
            t.startsAt < s.endsAt &&
            s.startsAt < t.endsAt!,
        )
        .map((t) => t.type);
      return {
        workDate: r.workDate,
        employee: r.employee,
        storeName: s.store.name,
        timeZone: tzOf(s.store),
        shiftStartsAt: s.startsAt,
        shiftEndsAt: s.endsAt,
        scheduledMinutes:
          Math.round((s.endsAt.getTime() - s.startsAt.getTime()) / 60_000) -
          s.breakMinutes,
        status: r.status,
        clockInAt: r.clockInAt,
        clockOutAt: r.clockOutAt,
        lateMinutes: r.lateMinutes,
        earlyLeaveMinutes: r.earlyLeaveMinutes,
        workedMinutes: r.workedMinutes,
        overtimeMinutes: r.overtimeMinutes,
        needsReview: r.needsReview,
        justifications: [
          ...new Set([...r.incidents.map((i) => i.type), ...covering]),
        ],
      };
    });
    return { rows: result, truncated };
  }

  async audit(companyId: string, f: AuditFilter, page: PageRequest) {
    const where: Prisma.AuditLogWhereInput = {
      companyId,
      createdAt: { gte: f.from, lt: f.to },
      ...(f.action && { action: { startsWith: f.action } }),
      entityType: f.entityType,
      entityId: f.entityId,
      actorUserId: f.actorUserId,
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...toSkipTake(page),
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    const actorIds = [
      ...new Set(
        rows.map((r) => r.actorUserId).filter((x): x is string => !!x),
      ),
    ];
    const users = new Map(
      (
        await this.prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      ).map((u) => [
        u.id,
        { id: u.id, name: `${u.firstName} ${u.lastName}`, email: u.email },
      ]),
    );
    return {
      total,
      items: rows.map((r) => ({
        id: r.id,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        actor: r.actorUserId ? (users.get(r.actorUserId) ?? null) : null,
        before: r.before,
        after: r.after,
        createdAt: r.createdAt,
      })),
    };
  }

  private approvedTimeOff(
    companyId: string,
    employeeIds: string[],
    from: Date,
    to: Date,
  ) {
    if (employeeIds.length === 0) return Promise.resolve([]);
    return this.prisma.incident.findMany({
      where: {
        companyId,
        employeeId: { in: employeeIds },
        type: { in: ['SICK_LEAVE', 'PERMISSION'] },
        status: 'APPROVED',
        startsAt: { lt: to },
        endsAt: { gt: from },
      },
      select: { employeeId: true, type: true, startsAt: true, endsAt: true },
    });
  }
}
