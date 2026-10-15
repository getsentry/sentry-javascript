import { Readable } from 'node:stream';
import type { Client } from '@sentry/core';
import { createEnvelope, getCurrentScope, getTunnelPath, makeDsn, serializeEnvelope } from '@sentry/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import tunnelPlugin from '../../src/nitro/tunnelPlugin';

const DSN = 'https://public@o1.ingest.sentry.io/1337';

type RequestHook = (event: unknown) => Promise<void>;

function setupPlugin(): RequestHook {
  let requestHook: RequestHook | undefined;
  (tunnelPlugin as (nitroApp: unknown) => void)({
    hooks: { hook: (name: string, fn: RequestHook) => name === 'request' && (requestHook = fn) },
  });

  return requestHook!;
}

function makeEvent(method: string, url: string, body = ''): { event: unknown; res: { end: ReturnType<typeof vi.fn> } } {
  const req = Object.assign(Readable.from([Buffer.from(body)]), { method, url, headers: { host: 'localhost' } });
  const res = { statusCode: 200, setHeader: vi.fn(), end: vi.fn() };

  return { event: { node: { req, res } }, res };
}

describe('SolidStart v1 tunnel plugin', () => {
  afterEach(() => {
    getCurrentScope().setClient(undefined);
    vi.unstubAllGlobals();
  });

  it('answers tunnel requests from the request hook when `init` enabled the managed tunnel', async () => {
    const options = { dsn: DSN, _managedTunnel: {} };
    getCurrentScope().setClient({ getDsn: () => makeDsn(DSN), getOptions: () => options } as unknown as Client);
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('forwarded'))),
    );
    const envelope = serializeEnvelope(createEnvelope({ dsn: DSN }, [])) as string;
    const { event, res } = makeEvent('POST', getTunnelPath(DSN)!, envelope);

    await setupPlugin()(event);

    expect(res.end).toHaveBeenCalledWith(Buffer.from('forwarded'));
  });

  it('leaves every other request to the app', async () => {
    const { event, res } = makeEvent('POST', '/api/users');

    await setupPlugin()(event);

    expect(res.end).not.toHaveBeenCalled();
  });
});
