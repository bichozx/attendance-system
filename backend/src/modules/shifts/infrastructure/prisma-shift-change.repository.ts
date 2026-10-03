import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { PageRequest, toSkipTake } from '../../../shared/application/page';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import {
  AssignmentContext,
  Coworker,
  ShiftChangeFilter,
  ShiftChangeRepository,
  ShiftChangeView,
  ShiftRef,
} from '../domain/shift-change.repository';
import type { ChangeKind, ChangeStage } from '../domain/shift-change.rules';

const SHIFT_REF = {
  id: true,
  startsAt: true,
  endsAt: true,
  status: true,
  schedulePeriod: { select: { status: true } },
  store: {
    select: {
      name: true,
      timezone: true,
      company: { select: { timezone: true } },
    },
  },
} satisfies Prisma.ShiftSelect;
type ShiftRow = Prisma.ShiftGetPayload<{ select: typeof SHIFT_REF }>;

const COWORKER = {
  id: true,
  firstName: true,
  lastName: true,
  status: true,
  userId: true,
} satisfies Prisma.EmployeeSelect;

const ASSIGNMENT = {
  id: true,
  employeeId: true,
  status: true,
  shift: { select: SHIFT_REF },
} satisfies Prisma.ShiftAssignmentSelect;
type AssignmentRow = Prisma.ShiftAssignmentGetPayload<{
  select: typeof ASSIGNMENT;
}>;

const VIEW = {
  id: true,
  type: true,
  status: true,
  peerRespondedAt: true,
  peerAccepted: true,
  shiftAssignmentId: true,
  counterpartAssignmentId: true,
  reason: true,
  reviewNotes: true,
  reviewedAt: true,
  createdAt: true,
  fromEmployee: { select: COWORKER },
  toEmployee: { select: COWORKER },
  shiftAssignment: { select: { shift: { select: SHIFT_REF } } },
  counterpartAssignment: { select: { shift: { select: SHIFT_REF } } },
} satisfies Prisma.ShiftChangeSelect;
type ViewRow = Prisma.ShiftChangeGetPayload<{ select: typeof VIEW }>;

const toRef = (s: ShiftRow): ShiftRef => ({
  shiftId: s.id,
  startsAt: s.startsAt,
  endsAt: s.endsAt,
  storeName: s.store.name,
  timeZone: s.store.timezone ?? s.store.company.timezone,
});

const toAssignment = (a: AssignmentRow): AssignmentContext => ({
  assignmentId: a.id,
  employeeId: a.employeeId,
  status: a.status,
  shift: {
    ...toRef(a.shift),
    status: a.shift.status,
    periodStatus: a.shift.schedulePeriod?.status ?? null,
  },
});

const participant = (e: NonNullable<ViewRow['fromEmployee']>) => ({
  employeeId: e.id,
  firstName: e.firstName,
  lastName: e.lastName,
  userId: e.userId,
});

const toView = (r: ViewRow): ShiftChangeView => ({
  id: r.id,
  kind: (r.type === 'SWAP' ? 'SWAP' : 'COVER') as ChangeKind,
  state: {
    status: r.status,
    peerRespondedAt: r.peerRespondedAt,
    peerAccepted: r.peerAccepted,
  },
  requester: participant(r.fromEmployee!),
  peer: participant(r.toEmployee!),
  shift: toRef(r.shiftAssignment.shift),
  peerShift: r.counterpartAssignment
    ? toRef(r.counterpartAssignment.shift)
    : null,
  shiftAssignmentId: r.shiftAssignmentId,
  counterpartAssignmentId: r.counterpartAssignmentId,
  reason: r.reason,
  reviewNotes: r.reviewNotes,
  peerRespondedAt: r.peerRespondedAt,
  reviewedAt: r.reviewedAt,
  createdAt: r.createdAt,
});

const STAGE_WHERE: Record<ChangeStage, Prisma.ShiftChangeWhereInput> = {
  AWAITING_PEER: { status: 'PENDING', peerRespondedAt: null },
  AWAITING_APPROVAL: { status: 'PENDING', peerAccepted: true },
  APPROVED: { status: 'APPROVED' },
  REJECTED: { status: 'REJECTED', NOT: { peerAccepted: false } },
  DECLINED_BY_PEER: { status: 'REJECTED', peerAccepted: false },
  CANCELLED: { status: 'CANCELLED' },
};

/** Turno visible para empleados (periodo publicado o sin periodo). */
const VISIBLE = {
  OR: [{ schedulePeriodId: null }, { schedulePeriod: { status: 'PUBLISHED' } }],
} satisfies Prisma.ShiftWhereInput;

@Injectable()
export class PrismaShiftChangeRepository extends ShiftChangeRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findAssignment(companyId: string, shiftId: string, employeeId: string) {
    const row = await this.prisma.shiftAssignment.findFirst({
      where: { companyId, shiftId, employeeId },
      select: ASSIGNMENT,
    });
    return row ? toAssignment(row) : null;
  }

  findCoworker(
    companyId: string,
    employeeId: string,
  ): Promise<Coworker | null> {
    return this.prisma.employee.findFirst({
      where: { companyId, id: employeeId, deletedAt: null },
      select: COWORKER,
    });
  }

  async pendingFor(companyId: string, assignmentIds: string[]) {
    const row = await this.prisma.shiftChange.findFirst({
      where: {
        companyId,
        isRequest: true,
        status: 'PENDING',
        OR: [
          { shiftAssignmentId: { in: assignmentIds } },
          { counterpartAssignmentId: { in: assignmentIds } },
        ],
      },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  async create(
    companyId: string,
    d: Parameters<ShiftChangeRepository['create']>[1],
  ) {
    const row = await this.prisma.shiftChange.create({
      data: {
        companyId,
        isRequest: true,
        type: d.kind === 'SWAP' ? 'SWAP' : 'REASSIGNMENT',
        status: 'PENDING',
        shiftAssignmentId: d.shiftAssignmentId,
        counterpartAssignmentId: d.counterpartAssignmentId,
        fromEmployeeId: d.requesterEmployeeId,
        toEmployeeId: d.peerEmployeeId,
        previousStartsAt: d.shift.startsAt,
        previousEndsAt: d.shift.endsAt,
        newStartsAt: d.peerShift?.startsAt,
        newEndsAt: d.peerShift?.endsAt,
        reason: d.reason,
        requestedById: d.requestedById,
      },
      select: { id: true },
    });
    return row.id;
  }

  async findById(companyId: string, id: string) {
    const row = await this.prisma.shiftChange.findFirst({
      where: { id, companyId, isRequest: true },
      select: VIEW,
    });
    return row ? toView(row) : null;
  }

  async list(companyId: string, filter: ShiftChangeFilter, page: PageRequest) {
    const where: Prisma.ShiftChangeWhereInput = {
      companyId,
      isRequest: true,
      ...(filter.stage && STAGE_WHERE[filter.stage]),
      ...(filter.participantEmployeeId && {
        AND: [
          {
            OR: [
              { fromEmployeeId: filter.participantEmployeeId },
              { toEmployeeId: filter.participantEmployeeId },
            ],
          },
        ],
      }),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.shiftChange.findMany({
        where,
        select: VIEW,
        orderBy: { createdAt: 'desc' },
        ...toSkipTake(page),
      }),
      this.prisma.shiftChange.count({ where }),
    ]);
    return { items: rows.map(toView), total };
  }

  async transition(
    companyId: string,
    id: string,
    expectPeerResponded: boolean,
    data: Parameters<ShiftChangeRepository['transition']>[3],
    fromStatus: 'PENDING' | 'APPROVED' = 'PENDING',
  ) {
    const { count } = await this.prisma.shiftChange.updateMany({
      where: {
        id,
        companyId,
        isRequest: true,
        status: fromStatus,
        ...(fromStatus === 'PENDING' &&
          (expectPeerResponded
            ? { peerAccepted: true }
            : { peerRespondedAt: null })),
      },
      data,
    });
    return count === 1;
  }

  coverCandidates(
    companyId: string,
    shiftId: string,
    excludeEmployeeId: string,
  ): Promise<Coworker[]> {
    return this.prisma.employee.findMany({
      where: {
        companyId,
        deletedAt: null,
        status: 'ACTIVE',
        userId: { not: null },
        id: { not: excludeEmployeeId },
        shiftAssignments: { none: { shiftId, status: 'ASSIGNED' } },
      },
      select: COWORKER,
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      take: 200,
    });
  }

  async swapOptions(
    companyId: string,
    requesterEmployeeId: string,
    from: Date,
    to: Date,
  ) {
    const rows = await this.prisma.shiftAssignment.findMany({
      where: {
        companyId,
        status: 'ASSIGNED',
        employeeId: { not: requesterEmployeeId },
        employee: { status: 'ACTIVE', userId: { not: null }, deletedAt: null },
        shift: {
          ...VISIBLE,
          status: 'SCHEDULED',
          startsAt: { gte: from, lt: to },
          // No sirve un turno en el que quien pide ya está asignado
          assignments: {
            none: { employeeId: requesterEmployeeId, status: 'ASSIGNED' },
          },
        },
      },
      select: { ...ASSIGNMENT, employee: { select: COWORKER } },
      orderBy: { shift: { startsAt: 'asc' } },
      take: 100,
    });
    return rows.map((r) => ({ ...toAssignment(r), employee: r.employee }));
  }

  async approverUserIds(companyId: string): Promise<string[]> {
    const rows = await this.prisma.companyMembership.findMany({
      where: {
        companyId,
        status: 'ACTIVE',
        role: {
          permissions: {
            some: { permission: { code: 'shift_changes.approve' } },
          },
        },
      },
      select: { userId: true },
    });
    return rows.map((r) => r.userId);
  }
}
