import { Injectable } from '@nestjs/common';
import { PushSender } from '../../../shared/application/push-sender';
import { NotificationRepository } from '../domain/notification.repository';

const MIN = 60_000;

/**
 * El proveedor confirma la entrega minutos después (recibos). Si un dispositivo ya no
 * existe (app desinstalada), se borra su token para no seguir enviándole.
 */
@Injectable()
export class ReceiptsService {
  constructor(
    private readonly repo: NotificationRepository,
    private readonly push: PushSender,
  ) {}

  async check(
    now = new Date(),
  ): Promise<{ checked: number; removedDevices: number }> {
    const tickets = await this.repo.ticketsOlderThan(
      new Date(now.getTime() - 15 * MIN),
      1_000,
    );
    let removedDevices = 0;
    if (tickets.length) {
      const result = await this.push.checkReceipts(tickets);
      removedDevices = await this.repo.deleteDeviceTokens(
        result.unregisteredTokens,
      );
      await this.repo.deleteTickets(result.processed);
    }
    // Los recibos solo existen ~24 h: lo que quede más viejo ya no se puede consultar
    await this.repo.deleteTicketsCreatedBefore(
      new Date(now.getTime() - 24 * 60 * MIN),
    );
    return { checked: tickets.length, removedDevices };
  }
}
