import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PushMessage,
  PushResult,
  PushSender,
  ReceiptCheck,
} from '../../application/push-sender';

const API = 'https://exp.host/--/api/v2/push';
const SEND_CHUNK = 100; // máximo por petición de envío
const RECEIPT_CHUNK = 1_000; // máximo por consulta de recibos
const EXPO_TOKEN = /^Expo(nent)?PushToken\[.+\]$/;

type Ticket =
  | { status: 'ok'; id: string }
  | { status: 'error'; message: string; details?: { error?: string } };
type Receipt =
  | { status: 'ok' }
  | { status: 'error'; message: string; details?: { error?: string } };

/**
 * Expo Push Service (https://docs.expo.dev/push-notifications/sending-notifications/).
 * EXPO_ACCESS_TOKEN es opcional: actívelo si habilita "enhanced push security" en Expo.
 */
@Injectable()
export class ExpoPushSender extends PushSender {
  private readonly accessToken?: string;

  constructor(
    config: ConfigService,
    private readonly fetchFn: typeof fetch = (...args) => fetch(...args),
  ) {
    super();
    this.accessToken = config.get<string>('EXPO_ACCESS_TOKEN') || undefined;
  }

  async send(tokens: string[], message: PushMessage): Promise<PushResult[]> {
    const results: PushResult[] = [];
    // Un token con formato inválido se trata como dispositivo inexistente (se borrará)
    const valid = tokens.filter((t) => EXPO_TOKEN.test(t));
    for (const t of tokens.filter((t) => !EXPO_TOKEN.test(t))) {
      results.push({
        token: t,
        ok: false,
        unregistered: true,
        error: 'InvalidToken',
      });
    }

    for (let i = 0; i < valid.length; i += SEND_CHUNK) {
      const chunk = valid.slice(i, i + SEND_CHUNK);
      const body = chunk.map((to) => ({
        to,
        title: message.title,
        body: message.body,
        data: message.data ?? {},
        sound: 'default',
        priority: 'high',
      }));
      const { data } = await this.post<{ data: Ticket[] }>('/send', body);
      chunk.forEach((token, j) => {
        const ticket = data[j];
        if (ticket?.status === 'ok') {
          results.push({
            token,
            ok: true,
            ticketId: ticket.id,
            unregistered: false,
          });
        } else {
          const error =
            ticket?.details?.error ?? ticket?.message ?? 'UnknownError';
          results.push({
            token,
            ok: false,
            unregistered: error === 'DeviceNotRegistered',
            error,
          });
        }
      });
    }
    return results;
  }

  async checkReceipts(
    tickets: { id: string; token: string }[],
  ): Promise<ReceiptCheck> {
    const check: ReceiptCheck = { processed: [], unregisteredTokens: [] };
    for (let i = 0; i < tickets.length; i += RECEIPT_CHUNK) {
      const chunk = tickets.slice(i, i + RECEIPT_CHUNK);
      const { data } = await this.post<{ data: Record<string, Receipt> }>(
        '/getReceipts',
        {
          ids: chunk.map((t) => t.id),
        },
      );
      for (const t of chunk) {
        const receipt = data[t.id];
        if (!receipt) continue; // aún no disponible: se consulta en la próxima vuelta
        check.processed.push(t.id);
        if (
          receipt.status === 'error' &&
          receipt.details?.error === 'DeviceNotRegistered'
        ) {
          check.unregisteredTokens.push(t.token);
        }
      }
    }
    return check;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const response = await this.fetchFn(`${API}${path}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(this.accessToken && {
          Authorization: `Bearer ${this.accessToken}`,
        }),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      // 429 / 5xx: el despachador reintentará más tarde
      throw new Error(
        `Expo Push respondió ${response.status}: ${(await response.text()).slice(0, 200)}`,
      );
    }
    return (await response.json()) as T;
  }
}
