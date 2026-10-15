import type { TransactionEvent } from '@sentry/core';
import * as SentryCore from '@sentry/core';
import { afterEach, describe, expect, test } from 'bun:test';
import { init } from '../src';

const DSN = 'https://username@domain/123';

describe('managed tunnel', () => {
  afterEach(() => {
    SentryCore.getCurrentScope().setClient(undefined);
  });

  test('Bun.serve drops the server span of tunnel requests', async () => {
    const transactions: string[] = [];
    init({
      dsn: DSN,
      tracesSampleRate: 1,
      traceLifecycle: 'static',
      // A meta-framework answers the tunnel requests, Bun only drops their server spans.
      tunnel: true,
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
    expect(await tunnelResponse.text()).toBe('app');
    await (await fetch(`${baseUrl}/after-tunnel`)).text();
    await SentryCore.flush();
    server.stop();

    expect(transactions).toHaveLength(1);
    expect(transactions[0]?.endsWith('/after-tunnel')).toBe(true);
  });
});
