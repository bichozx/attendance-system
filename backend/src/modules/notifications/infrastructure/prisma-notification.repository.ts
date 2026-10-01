import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { PageRequest, toSkipTake } from '../../../shared/application/page';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import {
  DispatchItem,
  NotificationRepository,
} from '../domain/notification.repository';
import type { ReminderCandidate } from '../domain/reminder.rules';

const VISIBLE_SHIFT = {
  status: 'SCHEDULED',
  OR: [
    { schedulePeriodId: null },
    { schedulePeriod: { status: { not: 'DRAFT' } } },
  ],
  company: { status: { in: ['ACTIVE', 'TRIAL'] }, deletedAt: null },
} satisfies Prisma.ShiftWhereInput;

@Injectable()
export class PrismaNotificationRepository extends NotificationRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  // ------------------------------------------------------------------
  // Despacho
  // ------------------------------------------------------------------

  claimDue(
    now: Date,
    limit: number,
    leaseUntil: Date,
  ): Promise<DispatchItem[]> {
    return this.prisma.$queryRaw<DispatchItem[]>`
      UPDATE notifications
         SET "nextAttemptAt" = ${leaseUntil}, attempts = attempts + 1
       WHERE id IN (
         SELECT id FROM notifications
          WHERE status = 'PENDING'
            AND ("scheduledFor" IS NULL OR "scheduledFor" <= ${now})
            AND ("nextAttemptAt" IS NULL OR "nextAttemptAt" <= ${now})
          ORDER BY "createdAt"
          LIMIT ${limit}
          FOR UPDATE SKIP LOCKED
       )
      RETURNING id, "companyId", "userId", type::text AS type, title, body, data, attempts`;
  }

  async activeDeviceTokens(
    companyId: string,
    userId: string,
    now: Date,
  ): Promise<string[]> {
    const rows = await this.prisma.deviceToken.findMany({
      where: {
        userId,
        session: { companyId, revokedAt: null, expiresAt: { gt: now } },
      },
      select: { token: true },
    });
    return rows.map((r) => r.token);
  }

  async markSent(id: string, pushedDevices: number, note: string | null) {
    await this.prisma.notification.update({
      where: { id },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        pushedDevices,
        lastError: note,
        nextAttemptAt: null,
      },
    });
  }

  async markRetry(id: string, nextAttemptAt: Date, error: string) {
    await this.prisma.notification.update({
      where: { id },
      data: { nextAttemptAt, lastError: error.slice(0, 500) },
    });
  }

  async markFailed(id: string, error: string) {
    await this.prisma.notification.update({
      where: { id },
      data: {
        status: 'FAILED',
        lastError: error.slice(0, 500),
        nextAttemptAt: null,
      },
    });
  }

  async deleteDeviceTokens(tokens: string[]): Promise<number> {
    if (tokens.length === 0) return 0;
    const { count } = await this.prisma.deviceToken.deleteMany({
      where: { token: { in: tokens } },
    });
    return count;
  }

  // ------------------------------------------------------------------
  // Recibos
  // ------------------------------------------------------------------

  async saveTickets(tickets: { id: string; token: string }[]) {
    if (tickets.length)
      await this.prisma.pushTicket.createMany({
        data: tickets,
        skipDuplicates: true,
      });
  }

  ticketsOlderThan(date: Date, limit: number) {
    return this.prisma.pushTicket.findMany({
      where: { createdAt: { lt: date } },
      select: { id: true, token: true },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  async deleteTickets(ids: string[]) {
    if (ids.length)
      await this.prisma.pushTicket.deleteMany({ where: { id: { in: ids } } });
  }

  async deleteTicketsCreatedBefore(date: Date) {
    await this.prisma.pushTicket.deleteMany({
      where: { createdAt: { lt: date } },
    });
  }

  // ------------------------------------------------------------------
  // Recordatorios
  // ------------------------------------------------------------------

  async reminderCandidates(from: Date, to: Date): Promise<ReminderCandidate[]> {
    const rows = await this.prisma.shiftAssignment.findMany({
      where: {
        status: 'ASSIGNED',
        employee: { userId: { not: null }, status: 'ACTIVE', deletedAt: null },
        shift: { ...VISIBLE_SHIFT, startsAt: { lt: to }, endsAt: { gt: from } },
      },
      select: {
        id: true,
        companyId: true,
        employee: { select: { userId: true } },
        attendance: { select: { clockInAt: true, status: true } },
        shift: {
          select: {
            id: true,
            startsAt: true,
            endsAt: true,
            lateToleranceMinutes: true,
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
      take: 5_000,
    });
    return rows.map((r) => ({
      assignmentId: r.id,
      shiftId: r.shift.id,
      companyId: r.companyId,
      userId: r.employee.userId!,
      storeName: r.shift.store.name,
      timeZone: r.shift.store.timezone ?? r.shift.store.company.timezone,
      startsAt: r.shift.startsAt,
      endsAt: r.shift.endsAt,
      lateToleranceMinutes: r.shift.lateToleranceMinutes,
      clockInAt: r.attendance?.clockInAt ?? null,
      attendanceStatus: r.attendance?.status ?? null,
    }));
  }

  // ------------------------------------------------------------------
  // Bandeja
  // ------------------------------------------------------------------

  async inbox(
    companyId: string,
    userId: string,
    unreadOnly: boolean,
    page: PageRequest,
  ) {
    const where: Prisma.NotificationWhereInput = {
      companyId,
      userId,
      ...(unreadOnly && { readAt: null }),
      // Las programadas a futuro aún no se muestran
      OR: [{ scheduledFor: null }, { scheduledFor: { lte: new Date() } }],
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        select: {
          id: true,
          type: true,
          title: true,
          body: true,
          data: true,
          readAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        ...toSkipTake(page),
      }),
      this.prisma.notification.count({ where }),
    ]);
    return { items, total };
  }

  unreadCount(companyId: string, userId: string) {
    return this.prisma.notification.count({
      where: {
        companyId,
        userId,
        readAt: null,
        OR: [{ scheduledFor: null }, { scheduledFor: { lte: new Date() } }],
      },
    });
  }

  async markRead(companyId: string, userId: string, id: string) {
    const { count } = await this.prisma.notification.updateMany({
      where: { id, companyId, userId },
      data: { readAt: new Date() },
    });
    return count === 1;
  }

  async markAllRead(companyId: string, userId: string) {
    const { count } = await this.prisma.notification.updateMany({
      where: { companyId, userId, readAt: null },
      data: { readAt: new Date() },
    });
    return count;
  }

  // ------------------------------------------------------------------
  // Dispositivos
  // ------------------------------------------------------------------

  async registerDevice(data: {
    userId: string;
    sessionId: string;
    token: string;
    platform: 'IOS' | 'ANDROID' | 'WEB';
  }) {
    // El mismo teléfono puede pasar de una persona a otra: el token queda con el último
    await this.prisma.deviceToken.upsert({
      where: { token: data.token },
      create: data,
      update: { ...data, lastSeenAt: new Date() },
    });
  }

  async unregisterDevice(userId: string, token: string) {
    const { count } = await this.prisma.deviceToken.deleteMany({
      where: { userId, token },
    });
    return count === 1;
  }

  // ------------------------------------------------------------------
  // Avisos
  // ------------------------------------------------------------------

  async audienceUserIds(
    companyId: string,
    audience: { storeIds?: string[]; employeeIds?: string[] },
  ) {
    const targeted = audience.storeIds?.length || audience.employeeIds?.length;
    const rows = await this.prisma.companyMembership.findMany({
      where: {
        companyId,
        status: 'ACTIVE',
        ...(targeted && {
          user: {
            employees: {
              some: {
                companyId,
                deletedAt: null,
                status: 'ACTIVE',
                OR: [
                  ...(audience.storeIds?.length
                    ? [{ defaultStoreId: { in: audience.storeIds } }]
                    : []),
                  ...(audience.employeeIds?.length
                    ? [{ id: { in: audience.employeeIds } }]
                    : []),
                ],
              },
            },
          },
        }),
      },
      select: { userId: true },
      take: 5_000,
    });
    return rows.map((r) => r.userId);
  }
}
