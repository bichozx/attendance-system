import { Injectable } from '@nestjs/common';
import { Actor, AuditLog } from '../../../shared/application/audit-log';
import { Notifier } from '../../../shared/application/notifier';
import { PageRequest, toPage } from '../../../shared/application/page';
import { utcToLocal } from '../../../shared/domain/zoned-time';
import { NotAnEmployeeError } from '../../attendance/domain/attendance.errors';
import {
  AssignmentContext,
  Coworker,
  ShiftChangeFilter,
  ShiftChangeRepository,
  ShiftChangeView,
  ShiftRef,
} from '../domain/shift-change.repository';
import {
  assertCanDo,
  assertEnoughNotice,
  ChangeKind,
  InvalidShiftChangeError,
  SelfApprovalForbiddenError,
  ShiftChangeAlreadyPendingError,
  ShiftChangeNotFoundError,
  ShiftChangeStaleError,
  ShiftChangeStateError,
  ShiftChangeTooLateError,
} from '../domain/shift-change.rules';
import {
  EmployeesNotAvailableError,
  ScheduleConflictError,
} from '../domain/shift.errors';
import { ShiftRepository } from '../domain/shift.repository';
import type { Candidate } from '../domain/shift.rules';
import { describeShift } from './shift-time';
import { ShiftsService } from './shifts.service';

export interface ChangeRequestInput {
  kind: ChangeKind;
  /** Mi turno (el que entrego). */
  shiftId: string;
  peerEmployeeId: string;
  /** Solo intercambio: el turno del compañero que recibo. */
  peerShiftId?: string;
  reason?: string | null;
}

interface Move {
  vacateAssignmentId: string;
  employeeId: string;
  shiftId: string;
  shift: ShiftRef;
}

const SWAP_WINDOW_DAYS = 14;

/**
 * Cambios de turno pedidos por empleados: cubrir (el compañero toma mi turno) o
 * intercambiar. Flujo: solicitud → el compañero acepta → el supervisor aprueba.
 * Todo se revalida al aprobar, bajo bloqueo, porque entre medio pueden pasar días.
 */
@Injectable()
export class ShiftChangeRequestsService {
  constructor(
    private readonly changes: ShiftChangeRepository,
    private readonly shiftsRepo: ShiftRepository,
    private readonly shifts: ShiftsService,
    private readonly notifier: Notifier,
    private readonly audit: AuditLog,
  ) {}

  // ------------------------------------------------------------------
  // Empleado
  // ------------------------------------------------------------------

  async request(
    actor: Actor,
    input: ChangeRequestInput,
  ): Promise<ShiftChangeView> {
    const me = await this.myEmployeeId(actor);
    if (input.peerEmployeeId === me)
      throw new InvalidShiftChangeError(
        'No puede hacerse un cambio consigo mismo',
      );
    if (input.kind === 'SWAP' && !input.peerShiftId) {
      throw new InvalidShiftChangeError(
        'Indique el turno del compañero (peerShiftId)',
      );
    }
    if (input.kind === 'COVER' && input.peerShiftId) {
      throw new InvalidShiftChangeError(
        'Para cubrir no se indica turno del compañero',
      );
    }

    const now = new Date();
    const mine = await this.usableAssignment(
      actor.companyId,
      input.shiftId,
      me,
      now,
    );
    const peer = await this.changes.findCoworker(
      actor.companyId,
      input.peerEmployeeId,
    );
    if (!peer || peer.status !== 'ACTIVE' || !peer.userId) {
      throw new EmployeesNotAvailableError([
        { employeeId: input.peerEmployeeId, reason: 'NOT_ACTIVE' },
      ]);
    }

    let theirs: AssignmentContext | null = null;
    if (input.kind === 'SWAP') {
      if (input.peerShiftId === input.shiftId)
        throw new InvalidShiftChangeError('Son el mismo turno');
      theirs = await this.usableAssignment(
        actor.companyId,
        input.peerShiftId!,
        peer.id,
        now,
      );
    } else {
      const peerOnShift = await this.changes.findAssignment(
        actor.companyId,
        mine.shift.shiftId,
        peer.id,
      );
      if (peerOnShift?.status === 'ASSIGNED') {
        throw new InvalidShiftChangeError('El compañero ya está en ese turno');
      }
    }

    const pending = await this.changes.pendingFor(
      actor.companyId,
      [mine.assignmentId, theirs?.assignmentId].filter((x): x is string => !!x),
    );
    if (pending) throw new ShiftChangeAlreadyPendingError(pending);

    // Validación previa (amable); la definitiva se hace al aprobar
    await this.assertFeasible(
      actor.companyId,
      this.movesFor(mine, peer.id, theirs, me),
    );

    const id = await this.changes.create(actor.companyId, {
      kind: input.kind,
      shiftAssignmentId: mine.assignmentId,
      counterpartAssignmentId: theirs?.assignmentId ?? null,
      requesterEmployeeId: me,
      peerEmployeeId: peer.id,
      shift: mine.shift,
      peerShift: theirs?.shift ?? null,
      reason: input.reason ?? null,
      requestedById: actor.userId,
    });
    const view = (await this.changes.findById(actor.companyId, id))!;

    await this.notify(
      actor.companyId,
      [peer.userId],
      view.kind === 'SWAP'
        ? {
            title: `${view.requester.firstName} te propone un intercambio`,
            body: `Tú tomas: ${this.describe(view.shift)}. ${view.requester.firstName} toma: ${this.describe(view.peerShift!)}. Responde en la app.`,
          }
        : {
            title: `${view.requester.firstName} te pide cubrir un turno`,
            body: `${this.describe(view.shift)}. Responde en la app.`,
          },
      id,
    );
    await this.record(actor, id, 'shift_change.requested', undefined, {
      kind: view.kind,
      peer: peer.id,
    });
    return view;
  }

  async myList(actor: Actor, filter: ShiftChangeFilter, page: PageRequest) {
    const me = await this.myEmployeeId(actor);
    return this.list(
      actor.companyId,
      { ...filter, participantEmployeeId: me },
      page,
    );
  }

  /** El compañero acepta o rechaza. */
  async respond(
    actor: Actor,
    id: string,
    accept: boolean,
    notes: string | null,
  ) {
    const me = await this.myEmployeeId(actor);
    const view = await this.get(actor.companyId, id);
    if (view.peer.employeeId !== me) throw new ShiftChangeNotFoundError();
    assertCanDo(view.state, 'PEER_RESPOND');
    const now = new Date();
    if (accept) assertEnoughNotice(this.firstStart(view), now);

    const ok = await this.changes.transition(actor.companyId, id, false, {
      peerRespondedAt: now,
      peerAccepted: accept,
      ...(accept ? {} : { status: 'REJECTED', reviewNotes: notes }),
    });
    if (!ok)
      throw new ShiftChangeStateError(
        'La solicitud cambió mientras se procesaba',
      );

    if (accept) {
      await this.notify(
        actor.companyId,
        [view.requester.userId],
        {
          title: `${view.peer.firstName} aceptó tu solicitud`,
          body: 'Ahora la revisa tu supervisor.',
        },
        id,
      );
      const approvers = (
        await this.changes.approverUserIds(actor.companyId)
      ).filter((u) => u !== view.requester.userId && u !== view.peer.userId);
      await this.notify(
        actor.companyId,
        approvers,
        {
          title: 'Cambio de turno por aprobar',
          body: `${this.names(view)}: ${this.summary(view)}`,
        },
        id,
      );
    } else {
      await this.notify(
        actor.companyId,
        [view.requester.userId],
        {
          title: `${view.peer.firstName} no aceptó tu solicitud`,
          body: notes ? `Comentario: ${notes}` : this.describe(view.shift),
        },
        id,
      );
    }
    await this.record(
      actor,
      id,
      accept ? 'shift_change.peer_accepted' : 'shift_change.peer_declined',
      undefined,
      { notes },
    );
    return this.get(actor.companyId, id);
  }

  /** Quien pidió el cambio lo retira. */
  async cancel(actor: Actor, id: string) {
    const me = await this.myEmployeeId(actor);
    const view = await this.get(actor.companyId, id);
    if (view.requester.employeeId !== me) throw new ShiftChangeNotFoundError();
    assertCanDo(view.state, 'CANCEL');
    const ok = await this.changes.transition(
      actor.companyId,
      id,
      view.state.peerRespondedAt !== null,
      {
        status: 'CANCELLED',
      },
    );
    if (!ok)
      throw new ShiftChangeStateError(
        'La solicitud cambió mientras se procesaba',
      );
    await this.notify(
      actor.companyId,
      [view.peer.userId],
      {
        title: `${view.requester.firstName} retiró su solicitud`,
        body: this.describe(view.shift),
      },
      id,
    );
    await this.record(
      actor,
      id,
      'shift_change.cancelled',
      undefined,
      undefined,
    );
    return this.get(actor.companyId, id);
  }

  /** Compañeros que podrían cubrir mi turno: activos, con app, disponibles y sin cruces. */
  async coverCandidates(actor: Actor, shiftId: string) {
    const me = await this.myEmployeeId(actor);
    const mine = await this.usableAssignment(
      actor.companyId,
      shiftId,
      me,
      new Date(),
    );
    const coworkers = await this.changes.coverCandidates(
      actor.companyId,
      shiftId,
      me,
    );
    const feasible = await this.filterFeasible(
      actor.companyId,
      coworkers.map((c) => ({
        key: c.id,
        moves: this.movesFor(mine, c.id, null, me),
      })),
    );
    return coworkers.filter((c) => feasible.has(c.id)).map(publicCoworker);
  }

  /** Turnos de compañeros (próximos 14 días) que se pueden intercambiar por el mío. */
  async swapOptions(actor: Actor, shiftId: string) {
    const me = await this.myEmployeeId(actor);
    const now = new Date();
    const mine = await this.usableAssignment(actor.companyId, shiftId, me, now);
    const from = new Date(now.getTime() + 60 * 60_000);
    const options = await this.changes.swapOptions(
      actor.companyId,
      me,
      from,
      new Date(now.getTime() + SWAP_WINDOW_DAYS * 86_400_000),
    );
    const usable = options.filter(
      (o) => o.shift.shiftId !== mine.shift.shiftId,
    );
    const feasible = await this.filterFeasible(
      actor.companyId,
      usable.map((o) => ({
        key: o.assignmentId,
        moves: this.movesFor(mine, o.employee.id, o, me),
      })),
    );
    return usable
      .filter((o) => feasible.has(o.assignmentId))
      .map((o) => ({ coworker: publicCoworker(o.employee), shift: o.shift }));
  }

  // ------------------------------------------------------------------
  // Supervisor
  // ------------------------------------------------------------------

  async list(companyId: string, filter: ShiftChangeFilter, page: PageRequest) {
    const { items, total } = await this.changes.list(companyId, filter, page);
    return toPage(items, total, page);
  }

  async get(companyId: string, id: string): Promise<ShiftChangeView> {
    const view = await this.changes.findById(companyId, id);
    if (!view) throw new ShiftChangeNotFoundError();
    return view;
  }

  async approve(actor: Actor, id: string, notes: string | null) {
    const view = await this.get(actor.companyId, id);
    this.assertNotParticipant(actor, view);
    assertCanDo(view.state, 'APPROVE');

    // Reclamar primero: si dos supervisores aprueban a la vez, solo uno ejecuta los movimientos
    const now = new Date();
    const claimed = await this.changes.transition(actor.companyId, id, true, {
      status: 'APPROVED',
      reviewedById: actor.userId,
      reviewedAt: now,
      reviewNotes: notes,
    });
    if (!claimed)
      throw new ShiftChangeStateError(
        'Otro supervisor ya resolvió esta solicitud',
      );

    try {
      if (this.firstStart(view) <= now) throw new ShiftChangeTooLateError();
      const moves = this.movesFromView(view);
      await this.assertAvailability(actor.companyId, moves);
      await this.shiftsRepo.applyMoves(actor.companyId, moves, actor.userId);
    } catch (error) {
      // Si ya no puede cumplirse nunca (turno movido, empezado), se cancela; si es un cruce
      // que el supervisor puede resolver, vuelve a pendiente.
      const final =
        error instanceof ShiftChangeStaleError ||
        error instanceof ShiftChangeTooLateError;
      await this.changes.transition(
        actor.companyId,
        id,
        true,
        final
          ? {
              status: 'CANCELLED',
              reviewNotes: 'Venció: los turnos cambiaron o ya empezaron',
            }
          : {
              status: 'PENDING',
              reviewedById: null,
              reviewedAt: null,
              reviewNotes: null,
            },
        'APPROVED',
      );
      throw error;
    }

    await this.notify(
      actor.companyId,
      [view.requester.userId, view.peer.userId],
      {
        title: 'Cambio de turno aprobado',
        body: this.summary(view),
      },
      id,
    );
    await this.record(actor, id, 'shift_change.approved', undefined, {
      notes,
      ...this.summaryIds(view),
    });
    return this.get(actor.companyId, id);
  }

  async reject(actor: Actor, id: string, notes: string) {
    const view = await this.get(actor.companyId, id);
    this.assertNotParticipant(actor, view);
    assertCanDo(view.state, 'REJECT');
    const ok = await this.changes.transition(
      actor.companyId,
      id,
      view.state.peerRespondedAt !== null,
      {
        status: 'REJECTED',
        reviewedById: actor.userId,
        reviewedAt: new Date(),
        reviewNotes: notes,
      },
    );
    if (!ok)
      throw new ShiftChangeStateError(
        'La solicitud cambió mientras se procesaba',
      );
    await this.notify(
      actor.companyId,
      [view.requester.userId, view.peer.userId],
      {
        title: 'Cambio de turno rechazado',
        body: `${this.summary(view)}. Motivo: ${notes}`,
      },
      id,
    );
    await this.record(actor, id, 'shift_change.rejected', undefined, { notes });
    return this.get(actor.companyId, id);
  }

  // ------------------------------------------------------------------
  // Validaciones
  // ------------------------------------------------------------------

  private async myEmployeeId(actor: Actor): Promise<string> {
    const id = await this.shiftsRepo.findEmployeeIdByUser(
      actor.companyId,
      actor.userId,
    );
    if (!id) throw new NotAnEmployeeError();
    return id;
  }

  /** La asignación existe, está activa, el turno es visible, programado y con anticipación. */
  private async usableAssignment(
    companyId: string,
    shiftId: string,
    employeeId: string,
    now: Date,
  ) {
    const a = await this.changes.findAssignment(companyId, shiftId, employeeId);
    if (!a || a.status !== 'ASSIGNED' || a.shift.periodStatus === 'DRAFT') {
      throw new InvalidShiftChangeError(
        'Ese turno no está asignado a la persona indicada',
      );
    }
    if (a.shift.status !== 'SCHEDULED')
      throw new InvalidShiftChangeError('El turno está cancelado');
    if (a.shift.periodStatus === 'CLOSED')
      throw new InvalidShiftChangeError('El periodo está cerrado');
    assertEnoughNotice(a.shift.startsAt, now);
    return a;
  }

  private movesFor(
    mine: AssignmentContext,
    peerId: string,
    theirs: AssignmentContext | null,
    me: string,
  ): Move[] {
    const moves: Move[] = [
      {
        vacateAssignmentId: mine.assignmentId,
        employeeId: peerId,
        shiftId: mine.shift.shiftId,
        shift: mine.shift,
      },
    ];
    if (theirs) {
      moves.push({
        vacateAssignmentId: theirs.assignmentId,
        employeeId: me,
        shiftId: theirs.shift.shiftId,
        shift: theirs.shift,
      });
    }
    return moves;
  }

  private movesFromView(v: ShiftChangeView): Move[] {
    const moves: Move[] = [
      {
        vacateAssignmentId: v.shiftAssignmentId,
        employeeId: v.peer.employeeId,
        shiftId: v.shift.shiftId,
        shift: v.shift,
      },
    ];
    if (v.peerShift && v.counterpartAssignmentId) {
      moves.push({
        vacateAssignmentId: v.counterpartAssignmentId,
        employeeId: v.requester.employeeId,
        shiftId: v.peerShift.shiftId,
        shift: v.peerShift,
      });
    }
    return moves;
  }

  private async assertAvailability(companyId: string, moves: Move[]) {
    const issues = await this.shifts.availabilityIssues(
      companyId,
      moves.map(toAvailability),
    );
    if (issues.size) {
      throw new EmployeesNotAvailableError(
        [...issues].map(([employeeId, reason]) => ({ employeeId, reason })),
      );
    }
  }

  private async assertFeasible(companyId: string, moves: Move[]) {
    await this.assertAvailability(companyId, moves);
    const conflicts = await this.shiftsRepo.previewConflicts(
      companyId,
      moves.map(toCandidate),
      moves.map((m) => m.vacateAssignmentId),
    );
    if (conflicts.length) throw new ScheduleConflictError(conflicts);
  }

  /** Para listas de opciones: qué combinaciones son viables (sin lanzar errores). */
  private async filterFeasible(
    companyId: string,
    options: { key: string; moves: Move[] }[],
  ) {
    const ok = new Set<string>();
    if (options.length === 0) return ok;
    const issues = await this.shifts.availabilityIssues(
      companyId,
      options.flatMap((o) => o.moves.map(toAvailability)),
    );
    for (const o of options) {
      if (o.moves.some((m) => issues.has(m.employeeId))) continue;
      const conflicts = await this.shiftsRepo.previewConflicts(
        companyId,
        o.moves.map(toCandidate),
        o.moves.map((m) => m.vacateAssignmentId),
      );
      if (conflicts.length === 0) ok.add(o.key);
    }
    return ok;
  }

  private assertNotParticipant(actor: Actor, view: ShiftChangeView) {
    if (
      actor.userId === view.requester.userId ||
      actor.userId === view.peer.userId
    ) {
      throw new SelfApprovalForbiddenError();
    }
  }

  // ------------------------------------------------------------------
  // Mensajes
  // ------------------------------------------------------------------

  private firstStart(v: ShiftChangeView): Date {
    return v.peerShift && v.peerShift.startsAt < v.shift.startsAt
      ? v.peerShift.startsAt
      : v.shift.startsAt;
  }

  private describe(s: ShiftRef) {
    return `${describeShift(s.startsAt, s.endsAt, s.timeZone)} en ${s.storeName}`;
  }

  private names(v: ShiftChangeView) {
    return `${v.requester.firstName} ${v.kind === 'SWAP' ? '↔' : '→'} ${v.peer.firstName}`;
  }

  private summary(v: ShiftChangeView) {
    return v.kind === 'SWAP'
      ? `${v.peer.firstName} toma ${this.describe(v.shift)}; ${v.requester.firstName} toma ${this.describe(v.peerShift!)}`
      : `${v.peer.firstName} cubre a ${v.requester.firstName}: ${this.describe(v.shift)}`;
  }

  private summaryIds(v: ShiftChangeView) {
    return {
      shiftId: v.shift.shiftId,
      peerShiftId: v.peerShift?.shiftId ?? null,
    };
  }

  private notify(
    companyId: string,
    userIds: (string | null)[],
    message: { title: string; body: string },
    shiftChangeId: string,
  ) {
    return this.notifier.notify(
      userIds
        .filter((u): u is string => !!u)
        .map((userId) => ({
          companyId,
          userId,
          type: 'SHIFT_CHANGED' as const,
          title: message.title,
          body: message.body,
          data: { shiftChangeId },
        })),
    );
  }

  private record(
    actor: Actor,
    id: string,
    action: string,
    before: unknown,
    after: unknown,
  ) {
    return this.audit.record({
      companyId: actor.companyId,
      actorUserId: actor.userId,
      action,
      entityType: 'ShiftChange',
      entityId: id,
      before,
      after,
    });
  }
}

function toCandidate(m: Move): Candidate {
  return {
    employeeId: m.employeeId,
    startsAt: m.shift.startsAt,
    endsAt: m.shift.endsAt,
  };
}

function toAvailability(m: Move) {
  return {
    employeeId: m.employeeId,
    date: utcToLocal(m.shift.startsAt, m.shift.timeZone).date,
    startsAt: m.shift.startsAt,
    endsAt: m.shift.endsAt,
  };
}

/** Lo único que un empleado ve de un compañero. */
function publicCoworker(c: Coworker) {
  return { employeeId: c.id, firstName: c.firstName, lastName: c.lastName };
}
