import { Injectable, Logger } from '@nestjs/common';
import { NotificationRequest, Notifier } from '../../application/notifier';

import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PrismaNotifier extends Notifier {
  private readonly logger = new Logger(PrismaNotifier.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async notify(requests: NotificationRequest[]): Promise<void> {
    if (requests.length === 0) return;
    try {
      await this.prisma.notification.createMany({
        data: requests.map((r) => ({
          companyId: r.companyId,
          userId: r.userId,
          type: r.type,
          title: r.title,
          body: r.body,
          data: r.data as Prisma.InputJsonValue | undefined,
          dedupeKey: r.dedupeKey,
          scheduledFor: r.scheduledFor,
        })),
        skipDuplicates: true, // dedupeKey repetida = ya se envió ese recordatorio
      });
    } catch (error) {
      // Una notificación fallida no debe revertir la operación de negocio
      this.logger.error(
        'No se pudieron encolar notificaciones',
        error as Error,
      );
    }
  }
}
