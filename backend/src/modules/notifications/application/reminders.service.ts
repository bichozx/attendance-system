import { Injectable } from '@nestjs/common';
import { Notifier } from '../../../shared/application/notifier';
import { NotificationRepository } from '../domain/notification.repository';
import { dueReminders, REMINDER_POLICY } from '../domain/reminder.rules';

const MIN = 60_000;

/** Genera los recordatorios que correspondan ahora (sin duplicar gracias a dedupeKey). */
@Injectable()
export class RemindersService {
  constructor(
    private readonly repo: NotificationRepository,
    private readonly notifier: Notifier,
  ) {}

  async generate(now = new Date()): Promise<number> {
    // Turnos que empiezan pronto, están en curso o terminaron hace menos de una hora
    const candidates = await this.repo.reminderCandidates(
      new Date(now.getTime() - REMINDER_POLICY.clockOutWindowMinutes * MIN),
      new Date(now.getTime() + REMINDER_POLICY.leadMinutes * MIN),
    );
    const reminders = dueReminders(candidates, now);
    await this.notifier.notify(reminders);
    return reminders.length;
  }
}
