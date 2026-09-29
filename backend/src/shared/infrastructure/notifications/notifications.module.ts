import { Global, Module } from '@nestjs/common';
import { Notifier } from '../../application/notifier';
import { PrismaNotifier } from './prisma-notifier';

@Global()
@Module({
  providers: [{ provide: Notifier, useClass: PrismaNotifier }],
  exports: [Notifier],
})
export class NotificationsModule {}
