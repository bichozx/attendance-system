import { Injectable, Logger } from '@nestjs/common';
import { PushSender } from '../../../shared/application/push-sender';
import {
  DispatchItem,
  NotificationRepository,
} from '../domain/notification.repository';
import { nextRetryAt } from '../domain/reminder.rules';

const BATCH = 100;
const LEASE_MS = 2 * 60_000;

export interface DispatchSummary {
  processed: number;
  sent: number;
  retried: number;
  failed: number;
  removedDevices: number;
}

/**
 * Envía por push las notificaciones pendientes (patrón outbox).
 * Varias instancias pueden correrlo a la vez: cada una toma lotes distintos.
 */
@Injectable()
export class DispatchService {
  private readonly logger = new Logger(DispatchService.name);

  constructor(
    private readonly repo: NotificationRepository,
    private readonly push: PushSender,
  ) {}

  async dispatchDue(now = new Date()): Promise<DispatchSummary> {
    const summary: DispatchSummary = {
      processed: 0,
      sent: 0,
      retried: 0,
      failed: 0,
      removedDevices: 0,
    };
    const items = await this.repo.claimDue(
      now,
      BATCH,
      new Date(now.getTime() + LEASE_MS),
    );
    for (const item of items) {
      summary.processed++;
      await this.deliver(item, now, summary);
    }
    return summary;
  }

  private async deliver(
    item: DispatchItem,
    now: Date,
    summary: DispatchSummary,
  ) {
    const tokens = await this.repo.activeDeviceTokens(
      item.companyId,
      item.userId,
      now,
    );
    // Sin dispositivos: queda en la bandeja de la app; no hay nada que reintentar
    if (tokens.length === 0) {
      await this.repo.markSent(item.id, 0, 'NO_ACTIVE_DEVICE');
      summary.sent++;
      return;
    }

    try {
      const results = await this.push.send(tokens, {
        title: item.title,
        body: item.body,
        data: {
          ...(item.data ?? {}),
          notificationId: item.id,
          type: item.type,
        },
      });

      const gone = results.filter((r) => r.unregistered).map((r) => r.token);
      summary.removedDevices += await this.repo.deleteDeviceTokens(gone);
      await this.repo.saveTickets(
        results
          .filter((r) => r.ok && r.ticketId)
          .map((r) => ({ id: r.ticketId!, token: r.token })),
      );

      const delivered = results.filter((r) => r.ok).length;
      const transient = results.filter((r) => !r.ok && !r.unregistered);
      if (delivered > 0 || transient.length === 0) {
        await this.repo.markSent(
          item.id,
          delivered,
          delivered ? null : 'ALL_DEVICES_UNREGISTERED',
        );
        summary.sent++;
      } else {
        await this.retryOrFail(
          item,
          now,
          transient[0].error ?? 'PUSH_ERROR',
          summary,
        );
      }
    } catch (error) {
      await this.retryOrFail(item, now, (error as Error).message, summary);
    }
  }

  private async retryOrFail(
    item: DispatchItem,
    now: Date,
    error: string,
    summary: DispatchSummary,
  ) {
    const next = nextRetryAt(item.attempts, now);
    if (next) {
      await this.repo.markRetry(item.id, next, error);
      summary.retried++;
    } else {
      await this.repo.markFailed(item.id, error);
      summary.failed++;
      this.logger.warn(
        `Notificación ${item.id} falló tras ${item.attempts} intentos: ${error}`,
      );
    }
  }
}
