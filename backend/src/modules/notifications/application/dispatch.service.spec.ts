import {
  PushResult,
  PushSender,
} from '../../../shared/application/push-sender';
import {
  DispatchItem,
  NotificationRepository,
} from '../domain/notification.repository';
import { MAX_PUSH_ATTEMPTS } from '../domain/reminder.rules';
import { DispatchService } from './dispatch.service';

function fakes(tokens: string[], push: (t: string[]) => Promise<PushResult[]>) {
  const state = {
    sent: [] as unknown[],
    retries: [] as unknown[],
    failed: [] as unknown[],
    deleted: [] as string[],
    tickets: [] as unknown[],
  };
  let queue: DispatchItem[] = [];
  const repo = {
    claimDue: async () => {
      const q = queue;
      queue = [];
      return q;
    },
    activeDeviceTokens: async () => tokens,
    markSent: async (id: string, n: number, note: string | null) =>
      void state.sent.push({ id, n, note }),
    markRetry: async (id: string, at: Date, error: string) =>
      void state.retries.push({ id, at, error }),
    markFailed: async (id: string, error: string) =>
      void state.failed.push({ id, error }),
    deleteDeviceTokens: async (t: string[]) => {
      state.deleted.push(...t);
      return t.length;
    },
    saveTickets: async (t: unknown[]) => void state.tickets.push(...t),
  } as unknown as NotificationRepository;
  const sender = { send: (t: string[]) => push(t) } as unknown as PushSender;
  const item = (attempts: number): DispatchItem => ({
    id: 'n1',
    companyId: 'c',
    userId: 'u',
    type: 'SHIFT_REMINDER',
    title: 'T',
    body: 'B',
    data: null,
    attempts,
  });
  return {
    service: new DispatchService(repo, sender),
    state,
    enqueue: (a: number) => (queue = [item(a)]),
  };
}

describe('DispatchService', () => {
  it('sin dispositivos: queda enviada (vive en la bandeja), sin reintentos', async () => {
    const { service, state, enqueue } = fakes([], async () => []);
    enqueue(1);
    await service.dispatchDue();
    expect(state.sent).toEqual([{ id: 'n1', n: 0, note: 'NO_ACTIVE_DEVICE' }]);
  });

  it('borra tokens de dispositivos que ya no existen y guarda tickets', async () => {
    const { service, state, enqueue } = fakes(['ok', 'gone'], async () => [
      { token: 'ok', ok: true, ticketId: 't1', unregistered: false },
      {
        token: 'gone',
        ok: false,
        unregistered: true,
        error: 'DeviceNotRegistered',
      },
    ]);
    enqueue(1);
    const summary = await service.dispatchDue();
    expect(state.deleted).toEqual(['gone']);
    expect(state.tickets).toEqual([{ id: 't1', token: 'ok' }]);
    expect(state.sent).toEqual([{ id: 'n1', n: 1, note: null }]);
    expect(summary.removedDevices).toBe(1);
  });

  it('proveedor caído: reintenta con espera y al final se rinde', async () => {
    const { service, state, enqueue } = fakes(['a'], async () => {
      throw new Error('Expo Push respondió 503');
    });
    enqueue(1);
    await service.dispatchDue();
    expect(state.retries).toHaveLength(1);
    expect(state.failed).toHaveLength(0);

    enqueue(MAX_PUSH_ATTEMPTS);
    await service.dispatchDue();
    expect(state.failed).toEqual([
      { id: 'n1', error: 'Expo Push respondió 503' },
    ]);
  });
});
