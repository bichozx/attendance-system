import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { PageRequest, toSkipTake } from '../../../shared/application/page';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import {
  AffectedShift,
  IncidentRepository,
} from '../domain/incident.repository';
import type {
  AttendanceForIncident,
  IncidentFilter,
  IncidentStatus,
  IncidentType,
  IncidentView,
  NewIncident,
} from '../domain/incident.types';

const INCIDENT_SELECT = {
  id: true,
  type: true,
  status: true,
  attendanceId: true,
  startsAt: true,
  endsAt: true,
  minutes: true,
  description: true,
  attachmentUrl: true,
  requestedById: true,
  reviewedById: true,
  reviewedAt: true,
  reviewNotes: true,
  createdAt: true,
  employee: {
    select: {
      id: true,
      code: true,
      firstName: true,
      lastName: true,
      userId: true,
    },
  },
} satisfies Prisma.IncidentSelect;

const ACTIVE: IncidentStatus[] = ['PENDING', 'APPROVED'];
const shiftTz = (store: {
  timezone: string | null;
  company: { timezone: string };
}) => store.timezone ?? store.company.timezone;

@Injectable()
export class PrismaIncidentRepository extends IncidentRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  findEmployeeByUser(companyId: string, userId: string) {
    return this.prisma.employee.findFirst({
      where: { companyId, userId, deletedAt: null },
      select: { id: true },
    });
  }

  findEmployee(companyId: string, id: string) {
    return this.prisma.employee.findFirst({
      where: { companyId, id, deletedAt: null },
      select: { id: true, userId: true },
    });
  }

  async companyTimeZone(companyId: string): Promise<string> {
    const c = await this.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { timezone: true },
    });
    return c.timezone;
  }

  async findAttendance(
    companyId: string,
    id: string,
  ): Promise<AttendanceForIncident | null> {
    const row = await this.prisma.attendance.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        employeeId: true,
        status: true,
        clockInAt: true,
        clockOutAt: true,
        lateMinutes: true,
        earlyLeaveMinutes: true,
        overtimeMinutes: true,
        shiftAssignment: {
          select: {
            shift: {
              select: {
                startsAt: true,
                endsAt: true,
                store: {
                  select: {
                    timezone: true,
                    company: { select: { timezone: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!row) return null;
    const { shiftAssignment, ...a } = row;
    const s = shiftAssignment.shift;
    return {
      ...a,
      shift: {
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        timeZone: shiftTz(s.store),
      },
    };
  }

  async findActiveForAttendance(
    companyId: string,
    attendanceId: string,
    type: IncidentType,
  ) {
    const row = await this.prisma.incident.findFirst({
      where: { companyId, attendanceId, type, status: { in: ACTIVE } },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  async findOverlappingTimeOff(
    companyId: string,
    employeeId: string,
    startsAt: Date,
    endsAt: Date,
  ) {
    const row = await this.prisma.incident.findFirst({
      where: {
        companyId,
        employeeId,
        type: { in: ['SICK_LEAVE', 'PERMISSION'] },
        status: { in: ACTIVE },
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  create(companyId: string, data: NewIncident): Promise<IncidentView> {
    return this.prisma.incident.create({
      data: { ...data, companyId },
      select: INCIDENT_SELECT,
    });
  }

  async list(companyId: string, filter: IncidentFilter, page: PageRequest) {
    const where: Prisma.IncidentWhereInput = {
      companyId,
      employeeId: filter.employeeId,
      type: filter.type,
      status: filter.status,
      ...(filter.from && {
        OR: [
          { endsAt: { gt: filter.from } },
          { endsAt: null, startsAt: { gte: filter.from } },
        ],
      }),
      ...(filter.to && { startsAt: { lt: filter.to } }),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.incident.findMany({
        where,
        select: INCIDENT_SELECT,
        orderBy: [{ createdAt: 'desc' }],
        ...toSkipTake(page),
      }),
      this.prisma.incident.count({ where }),
    ]);
    return { items, total };
  }

  findById(companyId: string, id: string): Promise<IncidentView | null> {
    return this.prisma.incident.findFirst({
      where: { id, companyId },
      select: INCIDENT_SELECT,
    });
  }

  async transition(
    companyId: string,
    id: string,
    from: IncidentStatus,
    change: {
      status: IncidentStatus;
      reviewedById: string | null;
      reviewNotes: string | null;
      minutes?: number;
    },
  ): Promise<boolean> {
    const { count } = await this.prisma.incident.updateMany({
      where: { id, companyId, status: from },
      data: {
        ...change,
        reviewedAt: change.reviewedById ? new Date() : undefined,
      },
    });
    return count === 1;
  }

  async findCoveredAbsences(
    companyId: string,
    employeeId: string,
    startsAt: Date,
    endsAt: Date,
  ) {
    const rows = await this.prisma.attendance.findMany({
      where: {
        companyId,
        employeeId,
        status: 'ABSENT',
        needsReview: true,
        shiftAssignment: {
          shift: { startsAt: { lt: endsAt }, endsAt: { gt: startsAt } },
        },
      },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  async markAttendancesReviewed(
    companyId: string,
    ids: string[],
    actorUserId: string,
  ) {
    if (ids.length === 0) return;
    await this.prisma.attendance.updateMany({
      where: { companyId, id: { in: ids }, needsReview: true },
      data: {
        needsReview: false,
        reviewedAt: new Date(),
        reviewedById: actorUserId,
      },
    });
  }

  async findAffectedShifts(
    companyId: string,
    employeeId: string,
    startsAt: Date,
    endsAt: Date,
  ): Promise<AffectedShift[]> {
    const rows = await this.prisma.shiftAssignment.findMany({
      where: {
        companyId,
        employeeId,
        status: 'ASSIGNED',
        shift: {
          status: 'SCHEDULED',
          startsAt: { lt: endsAt, gt: new Date() },
          endsAt: { gt: startsAt },
        },
      },
      select: {
        shift: {
          select: {
            id: true,
            startsAt: true,
            endsAt: true,
            store: {
              select: {
                name: true,
                timezone: true,
                company: { select: { timezone: true } },
              },
            },
          },
        },
      },
      orderBy: { shift: { startsAt: 'asc' } },
    });
    return rows.map(({ shift: s }) => ({
      shiftId: s.id,
      startsAt: s.startsAt,
      endsAt: s.endsAt,
      storeName: s.store.name,
      timeZone: shiftTz(s.store),
    }));
  }

  async timesheetData(
    companyId: string,
    filter: {
      from: Date;
      to: Date;
      rangeStart: Date;
      rangeEnd: Date;
      employeeId?: string;
      storeId?: string;
    },
  ) {
    const attendances = await this.prisma.attendance.findMany({
      where: {
        companyId,
        workDate: { gte: filter.from, lte: filter.to },
        employeeId: filter.employeeId,
        ...(filter.storeId && {
          shiftAssignment: { shift: { storeId: filter.storeId } },
        }),
      },
      select: {
        id: true,
        employeeId: true,
        status: true,
        clockInAt: true,
        workedMinutes: true,
        lateMinutes: true,
        earlyLeaveMinutes: true,
        overtimeMinutes: true,
        needsReview: true,
        shiftAssignment: {
          select: {
            shift: {
              select: { startsAt: true, endsAt: true, breakMinutes: true },
            },
          },
        },
      },
    });

    // Con filtro de tienda, solo quienes trabajaron ahí; sin filtro, también quien solo tuvo incapacidad/permiso
    const incidentWhere: Prisma.IncidentWhereInput = {
      companyId,
      status: { in: ['APPROVED', 'PENDING'] },
      startsAt: { lt: filter.rangeEnd },
      OR: [{ endsAt: { gt: filter.rangeStart } }, { endsAt: null }],
      ...(filter.employeeId && { employeeId: filter.employeeId }),
      ...(filter.storeId && {
        employeeId: { in: [...new Set(attendances.map((a) => a.employeeId))] },
      }),
    };
    const incidents = await this.prisma.incident.findMany({
      where: incidentWhere,
      select: {
        employeeId: true,
        type: true,
        status: true,
        attendanceId: true,
        startsAt: true,
        endsAt: true,
        minutes: true,
      },
    });

    const employeeIds = [
      ...new Set([
        ...attendances.map((a) => a.employeeId),
        ...incidents.map((i) => i.employeeId),
      ]),
    ];
    const employees = await this.prisma.employee.findMany({
      where: { companyId, id: { in: employeeIds } },
      select: { id: true, code: true, firstName: true, lastName: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });

    return {
      employees,
      incidents: incidents.map((i) => ({
        ...i,
        status: i.status as 'APPROVED' | 'PENDING',
      })),
      attendances: attendances.map(({ shiftAssignment: { shift }, ...a }) => ({
        ...a,
        shiftStartsAt: shift.startsAt,
        shiftEndsAt: shift.endsAt,
        scheduledWorkMinutes:
          Math.round(
            (shift.endsAt.getTime() - shift.startsAt.getTime()) / 60_000,
          ) - shift.breakMinutes,
      })),
    };
  }
}
