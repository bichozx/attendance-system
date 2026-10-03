import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import {
  AssignmentNotFoundError,
  ScheduleConflictError,
  ShiftNotFoundError,
} from '../domain/shift.errors';
import { ShiftRepository, ShiftToCreate } from '../domain/shift.repository';
import { ShiftChangeStaleError } from '../domain/shift-change.rules';
import { Candidate, findConflicts } from '../domain/shift.rules';
import type {
  BusySlot,
  EmployeeForScheduling,
  SchedulingStore,
  ShiftChangeRecord,
  ShiftFilter,
  ShiftTiming,
  ShiftView,
} from '../domain/shift.types';

type Tx = Prisma.TransactionClient;

const SHIFT_SELECT = {
  id: true,
  storeId: true,
  schedulePeriodId: true,
  startsAt: true,
  endsAt: true,
  breakMinutes: true,
  earlyClockInMinutes: true,
  lateToleranceMinutes: true,
  status: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  store: {
    select: {
      name: true,
      timezone: true,
      company: { select: { timezone: true } },
    },
  },
  schedulePeriod: { select: { status: true } },
  assignments: {
    select: {
      id: true,
      employeeId: true,
      status: true,
      employee: { select: { code: true, firstName: true, lastName: true } },
    },
    orderBy: { employee: { firstName: 'asc' } },
  },
} satisfies Prisma.ShiftSelect;

type ShiftRow = Prisma.ShiftGetPayload<{ select: typeof SHIFT_SELECT }>;

const toView = ({
  store,
  schedulePeriod,
  assignments,
  ...row
}: ShiftRow): ShiftView => ({
  ...row,
  storeName: store.name,
  timeZone: store.timezone ?? store.company.timezone,
  periodStatus: schedulePeriod?.status ?? null,
  assignments: assignments.map(({ employee, ...a }) => ({
    ...a,
    employeeCode: employee.code,
    firstName: employee.firstName,
    lastName: employee.lastName,
  })),
});

/** Límite de seguridad para consultas de calendario. */
const MAX_ROWS = 2_000;

@Injectable()
export class PrismaShiftRepository extends ShiftRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  // ------------------------------------------------------------------
  // Consultas
  // ------------------------------------------------------------------

  async list(companyId: string, filter: ShiftFilter): Promise<ShiftView[]> {
    const where: Prisma.ShiftWhereInput = {
      companyId,
      startsAt: { lt: filter.to },
      endsAt: { gt: filter.from },
      storeId: filter.storeId,
      schedulePeriodId: filter.schedulePeriodId,
      status: filter.status,
      ...(filter.employeeId && {
        assignments: { some: { employeeId: filter.employeeId } },
      }),
      ...(filter.visibleToEmployees && {
        OR: [
          { schedulePeriodId: null },
          { schedulePeriod: { status: { not: 'DRAFT' } } },
        ],
      }),
    };
    const rows = await this.prisma.shift.findMany({
      where,
      select: SHIFT_SELECT,
      orderBy: [{ startsAt: 'asc' }, { store: { name: 'asc' } }],
      take: MAX_ROWS,
    });
    return rows.map(toView);
  }

  async findById(companyId: string, id: string): Promise<ShiftView | null> {
    const row = await this.prisma.shift.findFirst({
      where: { id, companyId },
      select: SHIFT_SELECT,
    });
    return row ? toView(row) : null;
  }

  async findSchedulingStore(
    companyId: string,
    storeId: string,
  ): Promise<SchedulingStore | null> {
    const row = await this.prisma.store.findFirst({
      where: { id: storeId, companyId, deletedAt: null },
      select: {
        id: true,
        name: true,
        isActive: true,
        timezone: true,
        company: {
          select: {
            timezone: true,
            defaultBreakMinutes: true,
            defaultEarlyClockInMinutes: true,
            defaultLateToleranceMinutes: true,
          },
        },
      },
    });
    return row
      ? {
          id: row.id,
          name: row.name,
          isActive: row.isActive,
          timeZone: row.timezone ?? row.company.timezone,
          defaults: {
            breakMinutes: row.company.defaultBreakMinutes,
            earlyClockInMinutes: row.company.defaultEarlyClockInMinutes,
            lateToleranceMinutes: row.company.defaultLateToleranceMinutes,
          },
        }
      : null;
  }

  findEmployees(
    companyId: string,
    ids: string[],
  ): Promise<EmployeeForScheduling[]> {
    return this.prisma.employee.findMany({
      where: { companyId, id: { in: ids }, deletedAt: null },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        status: true,
        hireDate: true,
        terminationDate: true,
        userId: true,
      },
    });
  }

  async findEmployeeIdByUser(
    companyId: string,
    userId: string,
  ): Promise<string | null> {
    const row = await this.prisma.employee.findUnique({
      where: { companyId_userId: { companyId, userId } },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  async findApprovedTimeOff(
    companyId: string,
    employeeIds: string[],
    from: Date,
    to: Date,
  ) {
    const rows = await this.prisma.incident.findMany({
      where: {
        companyId,
        employeeId: { in: employeeIds },
        type: { in: ['SICK_LEAVE', 'PERMISSION'] },
        status: 'APPROVED',
        startsAt: { lt: to },
        endsAt: { gt: from },
      },
      select: { employeeId: true, startsAt: true, endsAt: true },
    });
    return rows.map((r) => ({ ...r, endsAt: r.endsAt! }));
  }

  async findUserIdsByEmployee(companyId: string, employeeIds: string[]) {
    const rows = await this.prisma.employee.findMany({
      where: { companyId, id: { in: employeeIds }, userId: { not: null } },
      select: { id: true, userId: true },
    });
    return new Map(rows.map((r) => [r.id, r.userId!]));
  }

  // ------------------------------------------------------------------
  // Escrituras con validación de cruces
  // ------------------------------------------------------------------

  async createMany(
    companyId: string,
    items: ShiftToCreate[],
    actorUserId: string,
  ): Promise<string[]> {
    return this.prisma.$transaction(
      async (tx) => {
        const candidates: Candidate[] = items.flatMap((item) =>
          item.employeeIds.map((employeeId) => ({
            employeeId,
            startsAt: item.shift.startsAt,
            endsAt: item.shift.endsAt,
          })),
        );
        await this.assertNoConflicts(tx, companyId, candidates);

        const ids: string[] = [];
        for (const { shift, employeeIds } of items) {
          const created = await tx.shift.create({
            data: {
              ...shift,
              companyId,
              createdById: actorUserId,
              assignments: {
                create: employeeIds.map((employeeId) => ({
                  companyId,
                  employeeId,
                  assignedById: actorUserId,
                })),
              },
            },
            select: { id: true },
          });
          ids.push(created.id);
        }
        return ids;
      },
      { timeout: 30_000 },
    );
  }

  async reschedule(
    companyId: string,
    id: string,
    timing: ShiftTiming,
    notes: string | null | undefined,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const assigned = await tx.shiftAssignment.findMany({
        where: { companyId, shiftId: id, status: 'ASSIGNED' },
        select: { employeeId: true },
      });
      await this.assertNoConflicts(
        tx,
        companyId,
        assigned.map((a) => ({
          employeeId: a.employeeId,
          ...timing,
          shiftId: id,
        })),
      );
      const { count } = await tx.shift.updateMany({
        where: { id, companyId, status: 'SCHEDULED' },
        data: { ...timing, notes },
      });
      if (count === 0) throw new ShiftNotFoundError();
    });
  }

  async assign(
    companyId: string,
    shiftId: string,
    employeeIds: string[],
    actorUserId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const shift = await tx.shift.findFirst({
        where: { id: shiftId, companyId, status: 'SCHEDULED' },
        select: {
          startsAt: true,
          endsAt: true,
          assignments: { select: { id: true, employeeId: true, status: true } },
        },
      });
      if (!shift) throw new ShiftNotFoundError();

      const existing = new Map(shift.assignments.map((a) => [a.employeeId, a]));
      const toAdd = employeeIds.filter(
        (e) => existing.get(e)?.status !== 'ASSIGNED',
      );
      await this.assertNoConflicts(
        tx,
        companyId,
        toAdd.map((employeeId) => ({
          employeeId,
          startsAt: shift.startsAt,
          endsAt: shift.endsAt,
        })),
      );

      const added: { assignmentId: string; employeeId: string }[] = [];
      for (const employeeId of toAdd) {
        const previous = existing.get(employeeId);
        const row = previous
          ? await tx.shiftAssignment.update({
              where: { id: previous.id },
              data: { status: 'ASSIGNED', assignedById: actorUserId },
              select: { id: true },
            })
          : await tx.shiftAssignment.create({
              data: {
                companyId,
                shiftId,
                employeeId,
                assignedById: actorUserId,
              },
              select: { id: true },
            });
        added.push({ assignmentId: row.id, employeeId });
      }
      return added;
    });
  }

  async unassign(
    companyId: string,
    shiftId: string,
    employeeId: string,
  ): Promise<string> {
    const assignment = await this.prisma.shiftAssignment.findFirst({
      where: { companyId, shiftId, employeeId, status: 'ASSIGNED' },
      select: { id: true },
    });
    if (!assignment) throw new AssignmentNotFoundError();
    await this.prisma.shiftAssignment.update({
      where: { id: assignment.id },
      data: { status: 'CANCELLED' },
    });
    return assignment.id;
  }

  async cancel(companyId: string, id: string): Promise<void> {
    const { count } = await this.prisma.shift.updateMany({
      where: { id, companyId, status: 'SCHEDULED' },
      data: { status: 'CANCELLED' },
    });
    if (count === 0) throw new ShiftNotFoundError();
  }

  async recordChanges(
    companyId: string,
    changes: ShiftChangeRecord[],
  ): Promise<void> {
    if (changes.length === 0) return;
    const now = new Date();
    await this.prisma.shiftChange.createMany({
      data: changes.map(({ actorUserId, ...c }) => ({
        ...c,
        companyId,
        status: 'APPROVED', // Cambios hechos por un admin quedan aprobados de inmediato
        requestedById: actorUserId,
        reviewedById: actorUserId,
        reviewedAt: now,
      })),
    });
  }

  // ------------------------------------------------------------------
  // Cambios entre empleados (cubrir / intercambiar)
  // ------------------------------------------------------------------

  async previewConflicts(
    companyId: string,
    candidates: Candidate[],
    vacating: string[],
  ) {
    if (candidates.length === 0) return [];
    const busy = await this.busySlots(
      this.prisma,
      companyId,
      candidates,
      vacating,
    );
    return findConflicts(candidates, busy);
  }

  async applyMoves(
    companyId: string,
    moves: {
      vacateAssignmentId: string;
      employeeId: string;
      shiftId: string;
    }[],
    actorUserId: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // 1) Bloquear a TODOS los involucrados (quien entrega y quien recibe), en orden fijo
      const vacated = await tx.shiftAssignment.findMany({
        where: {
          id: { in: moves.map((m) => m.vacateAssignmentId) },
          companyId,
        },
        select: { id: true, employeeId: true },
      });
      const people = [
        ...new Set([
          ...vacated.map((v) => v.employeeId),
          ...moves.map((m) => m.employeeId),
        ]),
      ].sort();
      for (const employeeId of people) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`shift-employee:${employeeId}`}, 0))`;
      }

      // 2) Liberar las asignaciones de origen: deben seguir activas y sin empezar
      const now = new Date();
      for (const move of moves) {
        const { count } = await tx.shiftAssignment.updateMany({
          where: {
            id: move.vacateAssignmentId,
            companyId,
            status: 'ASSIGNED',
            shift: { status: 'SCHEDULED', startsAt: { gt: now } },
          },
          data: { status: 'CANCELLED' },
        });
        if (count !== 1) throw new ShiftChangeStaleError();
      }

      // 3) Validar cruces con lo que queda (las liberadas ya no cuentan)
      const shifts = new Map(
        (
          await tx.shift.findMany({
            where: { id: { in: moves.map((m) => m.shiftId) }, companyId },
            select: { id: true, startsAt: true, endsAt: true },
          })
        ).map((s) => [s.id, s]),
      );
      const candidates: Candidate[] = moves.map((m) => ({
        employeeId: m.employeeId,
        startsAt: shifts.get(m.shiftId)!.startsAt,
        endsAt: shifts.get(m.shiftId)!.endsAt,
      }));
      const conflicts = findConflicts(
        candidates,
        await this.busySlots(tx, companyId, candidates, []),
      );
      if (conflicts.length) throw new ScheduleConflictError(conflicts);

      // 4) Asignar (reactivando si la persona ya estuvo en ese turno)
      for (const move of moves) {
        const previous = await tx.shiftAssignment.findUnique({
          where: {
            shiftId_employeeId: {
              shiftId: move.shiftId,
              employeeId: move.employeeId,
            },
          },
          select: { id: true },
        });
        if (previous) {
          await tx.shiftAssignment.update({
            where: { id: previous.id },
            data: { status: 'ASSIGNED', assignedById: actorUserId },
          });
        } else {
          await tx.shiftAssignment.create({
            data: {
              companyId,
              shiftId: move.shiftId,
              employeeId: move.employeeId,
              assignedById: actorUserId,
            },
          });
        }
      }
    });
  }

  /** Turnos activos de los candidatos en el rango, excluyendo asignaciones a liberar. */
  private async busySlots(
    db: Tx | PrismaService,
    companyId: string,
    candidates: Candidate[],
    vacating: string[],
  ) {
    const employeeIds = [...new Set(candidates.map((c) => c.employeeId))];
    const from = new Date(
      Math.min(...candidates.map((c) => c.startsAt.getTime())),
    );
    const to = new Date(Math.max(...candidates.map((c) => c.endsAt.getTime())));
    const rows = await db.shiftAssignment.findMany({
      where: {
        companyId,
        employeeId: { in: employeeIds },
        status: 'ASSIGNED',
        id: { notIn: vacating },
        shift: {
          status: 'SCHEDULED',
          startsAt: { lt: to },
          endsAt: { gt: from },
        },
      },
      select: {
        employeeId: true,
        shiftId: true,
        shift: { select: { startsAt: true, endsAt: true } },
      },
    });
    return rows.map((r) => ({
      employeeId: r.employeeId,
      shiftId: r.shiftId,
      startsAt: r.shift.startsAt,
      endsAt: r.shift.endsAt,
    }));
  }

  // ------------------------------------------------------------------
  // Detección de cruces
  // ------------------------------------------------------------------

  /**
   * 1. Bloquea a cada empleado involucrado (pg_advisory_xact_lock, se libera al terminar
   *    la transacción). Otra transacción que asigne a la misma persona espera aquí.
   * 2. Lee sus turnos activos en el rango y aplica la regla de dominio findConflicts.
   */
  private async assertNoConflicts(
    tx: Tx,
    companyId: string,
    candidates: Candidate[],
  ) {
    if (candidates.length === 0) return;
    const employeeIds = [
      ...new Set(candidates.map((c) => c.employeeId)),
    ].sort();

    // Orden fijo de bloqueo para evitar deadlocks entre transacciones
    for (const employeeId of employeeIds) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`shift-employee:${employeeId}`}, 0))`;
    }

    const from = new Date(
      Math.min(...candidates.map((c) => c.startsAt.getTime())),
    );
    const to = new Date(Math.max(...candidates.map((c) => c.endsAt.getTime())));
    const rows = await tx.shiftAssignment.findMany({
      where: {
        companyId,
        employeeId: { in: employeeIds },
        status: 'ASSIGNED',
        shift: {
          status: 'SCHEDULED',
          startsAt: { lt: to },
          endsAt: { gt: from },
        },
      },
      select: {
        employeeId: true,
        shiftId: true,
        shift: { select: { startsAt: true, endsAt: true } },
      },
    });
    const busy: BusySlot[] = rows.map((r) => ({
      employeeId: r.employeeId,
      shiftId: r.shiftId,
      startsAt: r.shift.startsAt,
      endsAt: r.shift.endsAt,
    }));

    const conflicts = findConflicts(candidates, busy);
    if (conflicts.length) throw new ScheduleConflictError(conflicts);
  }
}
