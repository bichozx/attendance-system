import { Injectable } from '@nestjs/common';
import {
  addDays,
  localToUtc,
  todayIn,
  utcToLocal,
} from '../../../shared/domain/zoned-time';
import {
  count,
  emptyCounters,
  LIVE_STATUS_LABEL,
  liveStatus,
  LiveCounters,
} from '../domain/live-status';
import { ReportsRepository } from '../domain/reports.repository';

/**
 * "¿Cómo va el día?" para el supervisor. Se calcula en cada consulta con la hora del
 * servidor: no hay nada que sincronizar ni cachear.
 */
@Injectable()
export class DashboardService {
  constructor(private readonly repo: ReportsRepository) {}

  async build(companyId: string, date?: string, storeId?: string) {
    const { timezone } = await this.repo.company(companyId);
    const day = date ?? todayIn(timezone);
    const from = localToUtc(day, '00:00', timezone);
    const to = localToUtc(addDays(day, 1), '00:00', timezone);
    const now = new Date();

    const [rows, pending] = await Promise.all([
      this.repo.dashboardRows(companyId, from, to, storeId),
      this.repo.pendingCounts(companyId),
    ]);

    const totals = emptyCounters();
    const byStore = new Map<
      string,
      { storeId: string; storeName: string; counters: LiveCounters }
    >();
    const people = rows.map((r) => {
      const status = liveStatus(r, now);
      const late = r.attendance?.lateMinutes ?? 0;
      count(totals, status, late);
      const store = byStore.get(r.store.id) ?? {
        storeId: r.store.id,
        storeName: r.store.name,
        counters: emptyCounters(),
      };
      count(store.counters, status, late);
      byStore.set(r.store.id, store);
      return {
        employeeId: r.employee.id,
        employeeCode: r.employee.code,
        name: `${r.employee.firstName} ${r.employee.lastName}`,
        storeName: r.store.name,
        shiftStart: utcToLocal(r.startsAt, r.timeZone).time,
        shiftEnd: utcToLocal(r.endsAt, r.timeZone).time,
        status,
        statusLabel: LIVE_STATUS_LABEL[status],
        clockIn: r.attendance?.clockInAt
          ? utcToLocal(r.attendance.clockInAt, r.timeZone).time
          : null,
        lateMinutes: late,
        /** Minutos desde el inicio (sin marcar) o desde el fin (salida pendiente). */
        minutesOverdue:
          status === 'MISSING'
            ? Math.floor((now.getTime() - r.startsAt.getTime()) / 60_000)
            : status === 'PENDING_EXIT'
              ? Math.floor((now.getTime() - r.endsAt.getTime()) / 60_000)
              : null,
      };
    });

    return {
      date: day,
      timeZone: timezone,
      serverTime: now,
      totals,
      byStore: [...byStore.values()].sort((a, b) =>
        a.storeName.localeCompare(b.storeName),
      ),
      /** Lo que requiere acción ya. */
      attention: {
        missingClockIn: people.filter((p) => p.status === 'MISSING'),
        pendingExit: people.filter((p) => p.status === 'PENDING_EXIT'),
      },
      pending,
      people,
    };
  }
}
