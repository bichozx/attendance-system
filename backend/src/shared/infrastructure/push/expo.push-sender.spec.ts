import { ExpoPushSender } from './expo.push-sender';

const config = { get: () => undefined } as never;
const ok = (body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));

describe('ExpoPushSender', () => {
  it('envía en lotes de 100 y clasifica tickets', async () => {
    const calls: unknown[][] = [];
    const fetchFn = ((_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as { to: string }[];
      calls.push(body);
      return ok({
        data: body.map((m) =>
          m.to.includes('gone')
            ? {
                status: 'error',
                message: 'x',
                details: { error: 'DeviceNotRegistered' },
              }
            : { status: 'ok', id: `t-${m.to}` },
        ),
      });
    }) as unknown as typeof fetch;
    const sender = new ExpoPushSender(config, fetchFn);
    const tokens = Array.from(
      { length: 150 },
      (_, i) => `ExponentPushToken[${i === 3 ? 'gone' : i}]`,
    );

    const results = await sender.send([...tokens, 'token-invalido'], {
      title: 'T',
      body: 'B',
    });
    expect(calls.map((c) => c.length)).toEqual([100, 50]);
    expect(results.filter((r) => r.ok)).toHaveLength(149);
    expect(
      results
        .filter((r) => r.unregistered)
        .map((r) => r.token)
        .sort(),
    ).toEqual(['ExponentPushToken[gone]', 'token-invalido'].sort());
  });

  it('un 503 se lanza para que el despachador reintente', async () => {
    const fetchFn = (() =>
      Promise.resolve(
        new Response('caído', { status: 503 }),
      )) as unknown as typeof fetch;
    await expect(
      new ExpoPushSender(config, fetchFn).send(['ExponentPushToken[a]'], {
        title: 'T',
        body: 'B',
      }),
    ).rejects.toThrow('503');
  });

  it('recibos: detecta dispositivos inexistentes y deja pendientes los no disponibles', async () => {
    const fetchFn = (() =>
      ok({
        data: {
          t1: { status: 'ok' },
          t2: {
            status: 'error',
            message: 'x',
            details: { error: 'DeviceNotRegistered' },
          },
        },
      })) as unknown as typeof fetch;
    const check = await new ExpoPushSender(config, fetchFn).checkReceipts([
      { id: 't1', token: 'A' },
      { id: 't2', token: 'B' },
      { id: 't3', token: 'C' },
    ]);
    expect(check).toEqual({
      processed: ['t1', 't2'],
      unregisteredTokens: ['B'],
    });
  });
});
