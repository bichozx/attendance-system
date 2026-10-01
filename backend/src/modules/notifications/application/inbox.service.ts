import { Injectable } from '@nestjs/common';
import { Actor, AuditLog } from '../../../shared/application/audit-log';
import { Notifier } from '../../../shared/application/notifier';
import { PageRequest, toPage } from '../../../shared/application/page';
import { DomainError } from '../../../shared/domain/domain-error';
import { NotificationRepository } from '../domain/notification.repository';

export class NotificationNotFoundError extends DomainError {
  readonly code = 'NOTIFICATION_NOT_FOUND';
  readonly kind = 'NOT_FOUND';
  constructor() {
    super('La notificación no existe');
  }
}

export class EmptyAudienceError extends DomainError {
  readonly code = 'EMPTY_AUDIENCE';
  readonly kind = 'VALIDATION';
  constructor() {
    super('Ningún usuario activo coincide con los destinatarios indicados');
  }
}

@Injectable()
export class InboxService {
  constructor(
    private readonly repo: NotificationRepository,
    private readonly notifier: Notifier,
    private readonly audit: AuditLog,
  ) {}

  async list(actor: Actor, unreadOnly: boolean, page: PageRequest) {
    const { items, total } = await this.repo.inbox(
      actor.companyId,
      actor.userId,
      unreadOnly,
      page,
    );
    return toPage(items, total, page);
  }

  async unreadCount(actor: Actor) {
    return {
      unread: await this.repo.unreadCount(actor.companyId, actor.userId),
    };
  }

  async markRead(actor: Actor, id: string) {
    if (!(await this.repo.markRead(actor.companyId, actor.userId, id))) {
      throw new NotificationNotFoundError();
    }
  }

  async markAllRead(actor: Actor) {
    return {
      marked: await this.repo.markAllRead(actor.companyId, actor.userId),
    };
  }

  async registerDevice(
    actor: Actor & { sessionId: string },
    token: string,
    platform: 'IOS' | 'ANDROID' | 'WEB',
  ) {
    await this.repo.registerDevice({
      userId: actor.userId,
      sessionId: actor.sessionId,
      token,
      platform,
    });
  }

  async unregisterDevice(actor: Actor, token: string) {
    await this.repo.unregisterDevice(actor.userId, token);
  }

  /** Aviso administrativo a toda la empresa, a ciertas sedes o a ciertos empleados. */
  async announce(
    actor: Actor,
    input: {
      title: string;
      body: string;
      storeIds?: string[];
      employeeIds?: string[];
    },
  ) {
    const userIds = await this.repo.audienceUserIds(actor.companyId, input);
    if (userIds.length === 0) throw new EmptyAudienceError();
    await this.notifier.notify(
      userIds.map((userId) => ({
        companyId: actor.companyId,
        userId,
        type: 'ADMIN_ANNOUNCEMENT' as const,
        title: input.title,
        body: input.body,
      })),
    );
    await this.audit.record({
      companyId: actor.companyId,
      actorUserId: actor.userId,
      action: 'notification.announcement_sent',
      entityType: 'Notification',
      entityId: actor.companyId,
      after: {
        title: input.title,
        recipients: userIds.length,
        storeIds: input.storeIds,
        employeeIds: input.employeeIds,
      },
    });
    return { recipients: userIds.length };
  }
}
