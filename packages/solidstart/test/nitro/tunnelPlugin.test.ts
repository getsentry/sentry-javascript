import type { Client } from '@sentry/core';
import { createEnvelope, getCurrentScope, getTunnelPath, makeDsn, serializeEnvelope } from '@sentry/core';
import { createApp, eventHandler, setHeaders, toNodeListener } from 'h3';
import { fetchNodeRequestHandler } from 'node-mock-http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import tunnelPlugin from '../../src/nitro/tunnelPlugin';

const DSN = 'https://public@o1.ingest.sentry.io/1337';

type RequestHook = (event: unknown) => Promise<void>;

/**
 * Calls an h3 app wired like Nitro v2's: the `request` hook runs in `onRequest`, and the route rules layer, here
 * with a `headers` rule, comes before the app. Requests come in the way serverless presets pass them through
 * `localFetch`, with node-mock-http's request, which isn't a Node stream.
 */
function fetchApp(url: string, init: RequestInit): Promise<Response> {
  const requestHooks: RequestHook[] = [];
  const app = createApp({
    onRequest: async event => {
      for (const hook of requestHooks) {
        await hook(event);
      }
    },
    onError: error => onError(error),
  });
  app.use(eventHandler(event => setHeaders(event, { 'x-route-rule': '1' })));
  app.use(eventHandler(() => 'app'));
  (tunnelPlugin as (nitroApp: unknown) => void)({
    h3App: app,
    hooks: { hook: (name: string, fn: RequestHook) => name === 'request' && requestHooks.push(fn) },
  });

  return fetchNodeRequestHandler(toNodeListener(app), `http://localhost${url}`, init);
}

const onError = vi.fn();

describe('SolidStart v1 tunnel plugin', () => {
  afterEach(() => {
    getCurrentScope().setClient(undefined);
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('answers tunnel requests before route rules and the app when `init` enabled the managed tunnel', async () => {
    const options = { dsn: DSN, _managedTunnel: {} };
    getCurrentScope().setClient({ getDsn: () => makeDsn(DSN), getOptions: () => options } as unknown as Client);
    const sentryFetch = vi.fn((_url: string, _init: RequestInit) => Promise.resolve(new Response('forwarded')));
    vi.stubGlobal('fetch', sentryFetch);
    const envelope = serializeEnvelope(createEnvelope({ dsn: DSN }, [])) as string;

    const response = await fetchApp(getTunnelPath(DSN)!, { method: 'POST', body: envelope });

    expect(await response.text()).toBe('forwarded');
    expect(await new Response(sentryFetch.mock.lastCall![1].body).text()).toBe(envelope);
    // A route rule that ran after the answer would fail to set headers on the sent response.
    expect(response.headers.get('x-route-rule')).toBeNull();
    expect(onError).not.toHaveBeenCalled();
  });

  it('leaves every other request to the app', async () => {
    const response = await fetchApp('/api/users', { method: 'POST', body: 'x' });

    expect(await response.text()).toBe('app');
    expect(response.headers.get('x-route-rule')).toBe('1');
  });
});
