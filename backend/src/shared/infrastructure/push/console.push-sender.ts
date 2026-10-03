import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  PushMessage,
  PushResult,
  PushSender,
  ReceiptCheck,
} from '../../application/push-sender';

/**
 * Desarrollo: imprime el push en la terminal.
 * Para probar la limpieza de tokens sin un teléfono:
 * - token con "UNREGISTERED" → falla al enviar (como un ticket con DeviceNotRegistered);
 * - token con "RECEIPT-GONE" → se envía, pero el recibo posterior lo reporta inexistente.
 */
@Injectable()
export class ConsolePushSender extends PushSender {
  private readonly logger = new Logger('Push');
  private readonly tickets = new Map<string, string>();

  async send(tokens: string[], message: PushMessage): Promise<PushResult[]> {
    this.logger.log(
      `📱 PUSH a ${tokens.length} dispositivo(s): "${message.title}" — ${message.body}`,
    );
    return tokens.map((token) => {
      if (token.includes('UNREGISTERED') && !token.includes('RECEIPT-GONE')) {
        return {
          token,
          ok: false,
          unregistered: true,
          error: 'DeviceNotRegistered',
        };
      }
      const ticketId = `console-${randomUUID()}`;
      this.tickets.set(ticketId, token);
      return { token, ok: true, ticketId, unregistered: false };
    });
  }

  async checkReceipts(
    tickets: { id: string; token: string }[],
  ): Promise<ReceiptCheck> {
    return {
      processed: tickets.map((t) => t.id),
      unregisteredTokens: tickets
        .filter((t) => t.token.includes('RECEIPT-GONE'))
        .map((t) => t.token),
    };
  }
}
