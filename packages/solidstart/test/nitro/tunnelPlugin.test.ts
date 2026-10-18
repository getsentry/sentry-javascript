import type { Client } from '@sentry/core';
import { createEnvelope, getCurrentScope, getTunnelPath, makeDsn, serializeEnvelope } from '@sentry/core';
import { createApp, eventHandler, toNodeListener } from 'h3';
import { fetchNodeRequestHandler } from 'node-mock-http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import tunnelPlugin from '../../src/nitro/tunnelPlugin';

const DSN = 'https://public@o1.ingest.sentry.io/1337';

type RequestHook = (event: unknown) => Promise<void>;

/**
 * Calls an h3 app running the plugin's `request` hook the way Nitro v2's `localFetch` does, with node-mock-http's
 * request, which isn't a Node stream. Serverless presets pass every request through this.
 */
function fetchApp(url: string, init: RequestInit): Promise<Response> {
  let requestHook: RequestHook | undefined;
  (tunnelPlugin as (nitroApp: unknown) => void)({
    hooks: { hook: (name: string, fn: RequestHook) => name === 'request' && (requestHook = fn) },
  });
  const app = createApp({ onRequest: event => requestHook!(event) });
  app.use(eventHandler(() => 'app'));

  return fetchNodeRequestHandler(toNodeListener(app), `http://localhost${url}`, init);
}

describe('SolidStart v1 tunnel plugin', () => {
  afterEach(() => {
    getCurrentScope().setClient(undefined);
    vi.unstubAllGlobals();
  });

  it('answers tunnel requests from the request hook when `init` enabled the managed tunnel', async () => {
    const options = { dsn: DSN, _managedTunnel: {} };
    getCurrentScope().setClient({ getDsn: () => makeDsn(DSN), getOptions: () => options } as unknown as Client);
    const sentryFetch = vi.fn((_url: string, _init: RequestInit) => Promise.resolve(new Response('forwarded')));
    vi.stubGlobal('fetch', sentryFetch);
    const envelope = serializeEnvelope(createEnvelope({ dsn: DSN }, [])) as string;

    const response = await fetchApp(getTunnelPath(DSN)!, { method: 'POST', body: envelope });

    expect(await response.text()).toBe('forwarded');
    expect(await new Response(sentryFetch.mock.lastCall![1].body).text()).toBe(envelope);
  });

  it('leaves every other request to the app', async () => {
    const response = await fetchApp('/api/users', { method: 'POST', body: 'x' });

    expect(await response.text()).toBe('app');
  });
});
