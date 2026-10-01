import { Module } from '@nestjs/common';
import { DispatchService } from './application/dispatch.service';
import { InboxService } from './application/inbox.service';
import { NotificationsJobs } from './application/notifications.jobs';
import { ReceiptsService } from './application/receipts.service';
import { RemindersService } from './application/reminders.service';
import { NotificationRepository } from './domain/notification.repository';
import { PrismaNotificationRepository } from './infrastructure/prisma-notification.repository';
import {
  AnnouncementsController,
  MyNotificationsController,
} from './presentation/notifications.controller';

/** Entrega push, recordatorios, bandeja y avisos. (El puerto Notifier vive en shared.) */
@Module({
  controllers: [MyNotificationsController, AnnouncementsController],
  providers: [
    DispatchService,
    RemindersService,
    ReceiptsService,
    InboxService,
    NotificationsJobs,
    { provide: NotificationRepository, useClass: PrismaNotificationRepository },
  ],
})
export class NotificationCenterModule {}
