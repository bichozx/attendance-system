import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { DispatchService } from './dispatch.service';
import { ReceiptsService } from './receipts.service';
import { RemindersService } from './reminders.service';

/**
 * Procesos periódicos (segundos; 0 = desactivado):
 * - NOTIFICATIONS_DISPATCH_INTERVAL_SECONDS (10): envía lo pendiente.
 * - REMINDERS_INTERVAL_SECONDS (60): genera recordatorios de turno.
 * - PUSH_RECEIPTS_INTERVAL_SECONDS (900): revisa recibos y limpia tokens muertos.
 * Seguros con varias instancias: el despacho usa SKIP LOCKED y los recordatorios dedupeKey.
 */
@Injectable()
export class NotificationsJobs
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(NotificationsJobs.name);
  private readonly running = new Set<string>();
  private readonly names: string[] = [];

  constructor(
    private readonly dispatch: DispatchService,
    private readonly reminders: RemindersService,
    private readonly receipts: ReceiptsService,
    private readonly scheduler: SchedulerRegistry,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap() {
    this.every(
      'notifications-dispatch',
      'NOTIFICATIONS_DISPATCH_INTERVAL_SECONDS',
      10,
      () => this.dispatch.dispatchDue(),
    );
    this.every('shift-reminders', 'REMINDERS_INTERVAL_SECONDS', 60, () =>
      this.reminders.generate(),
    );
    this.every('push-receipts', 'PUSH_RECEIPTS_INTERVAL_SECONDS', 900, () =>
      this.receipts.check(),
    );
  }

  onModuleDestroy() {
    for (const name of this.names) {
      if (this.scheduler.doesExist('interval', name))
        this.scheduler.deleteInterval(name);
    }
  }

  private every(
    name: string,
    envKey: string,
    fallback: number,
    work: () => Promise<unknown>,
  ) {
    const seconds = Number(this.config.get(envKey) ?? fallback);
    if (seconds <= 0) return;
    const run = async () => {
      if (this.running.has(name)) return; // la vuelta anterior aún no termina
      this.running.add(name);
      try {
        await work();
      } catch (error) {
        this.logger.error(`Falló el proceso ${name}`, error as Error);
      } finally {
        this.running.delete(name);
      }
    };
    this.scheduler.addInterval(
      name,
      setInterval(() => void run(), seconds * 1000),
    );
    this.names.push(name);
  }
}
