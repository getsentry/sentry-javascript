import type { TransactionEvent } from '@sentry/core';
import * as SentryCore from '@sentry/core';
import { afterEach, describe, expect, test } from 'bun:test';
import { init, serveTunnelIntegration } from '../src';

const DSN = 'https://username@domain/123';

describe('managed tunnel', () => {
  afterEach(() => {
    SentryCore.getCurrentScope().setClient(undefined);
  });

  test('Bun.serve answers tunnel requests before the app, without a server span', async () => {
    const transactions: string[] = [];
    init({
      dsn: DSN,
      tracesSampleRate: 1,
      traceLifecycle: 'static',
      integrations: [serveTunnelIntegration()],
      beforeSendTransaction: (event: TransactionEvent) => {
        transactions.push(event.request?.url ?? '');
        return null;
      },
      transport: () =>
        SentryCore.createTransport({ recordDroppedEvent: () => undefined }, () => SentryCore.resolvedSyncPromise({})),
    });

    const server = Bun.serve({ port: 0, fetch: () => new Response('app') });
    const baseUrl = `http://localhost:${server.port}`;

    const tunnelResponse = await fetch(`${baseUrl}${SentryCore.getTunnelPath(DSN)}`, {
      method: 'POST',
      body: 'envelope',
    });
    // Answered by the tunnel, which rejects the body as an envelope, not by the app.
    expect(await tunnelResponse.text()).toBe('Invalid envelope');
    await (await fetch(`${baseUrl}/after-tunnel`)).text();
    await SentryCore.flush();
    server.stop();

    expect(transactions).toHaveLength(1);
    expect(transactions[0]?.endsWith('/after-tunnel')).toBe(true);
  });

  test("leaves the app's options as they were, so passing them again to `reload` works", async () => {
    initWithTunnel();
    const appFetch = (): Response => new Response('app');
    const appRoute = (): Response => new Response('route');
    const options = { port: 0, fetch: appFetch, routes: { '/route': appRoute } };

    const server = Bun.serve(options);
    server.reload(options);
    server.reload(options);
    const baseUrl = `http://localhost:${server.port}`;

    try {
      expect(options.fetch).toBe(appFetch);
      expect(options.routes).toEqual({ '/route': appRoute });
      expect(await tunnelAnswer(baseUrl)).toBe('Invalid envelope');
      expect(await (await fetch(`${baseUrl}/route`)).text()).toBe('route');
      expect(await (await fetch(`${baseUrl}/other`)).text()).toBe('app');
    } finally {
      server.stop();
    }
  });

  test('answers tunnel requests for options a class gives through getters', async () => {
    initWithTunnel();
    class AppOptions {
      public port = 0;
      public get fetch(): () => Response {
        return () => new Response('app');
      }
    }

    const server = Bun.serve(new AppOptions());
    const baseUrl = `http://localhost:${server.port}`;

    try {
      expect(await tunnelAnswer(baseUrl)).toBe('Invalid envelope');
      expect(await (await fetch(`${baseUrl}/other`)).text()).toBe('app');
    } finally {
      server.stop();
    }
  });
});

function initWithTunnel(): void {
  init({
    dsn: DSN,
    integrations: [serveTunnelIntegration()],
    transport: () =>
      SentryCore.createTransport({ recordDroppedEvent: () => undefined }, () => SentryCore.resolvedSyncPromise({})),
  });
}

/**
 * Posts a non-envelope to the tunnel path. The tunnel rejects it, the app would answer `app`.
 */
async function tunnelAnswer(baseUrl: string): Promise<string> {
  const response = await fetch(`${baseUrl}${SentryCore.getTunnelPath(DSN)}`, { method: 'POST', body: 'envelope' });

  return response.text();
}
