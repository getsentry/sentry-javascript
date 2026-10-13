import type { TransactionEvent } from '@sentry/core';
import { createStackParser, setCurrentClient, startSpan } from '@sentry/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CloudflareClient } from '../../src/client';
import { fetchIntegration } from '../../src/integrations/fetch';
import { getDefaultIntegrations } from '../../src/sdk';

// The behavior lives in `createFetchIntegration` and is covered by
// `packages/core/test/lib/integrations/fetch.test.ts`. This only pins the wiring.
describe('fetchIntegration', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is named `Fetch` and is enabled by default', () => {
    expect(fetchIntegration().name).toBe('Fetch');
    expect(getDefaultIntegrations({}).map(integration => integration.name)).toContain('Fetch');
  });

  it('creates `http.client` spans with the `auto.http.fetch` origin', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('ok')));

    const transactions: TransactionEvent[] = [];
    const client = new CloudflareClient({
      dsn: 'https://public@dsn.ingest.sentry.io/1337',
      tracesSampleRate: 1,
      traceLifecycle: 'static',
      integrations: [fetchIntegration()],
      stackParser: createStackParser(),
      transport: () => ({ send: () => Promise.resolve({}), flush: () => Promise.resolve(true) }),
      beforeSendTransaction(event) {
        transactions.push(event);
        return null;
      },
    });
    setCurrentClient(client);
    client.init();

    await startSpan({ name: 'parent', op: 'test' }, async () => {
      await fetch('http://my-website.com/').then(response => response.text());
    });

    const parent = transactions.find(event => event.transaction === 'parent');
    const clientSpan = parent?.spans?.find(span => span.op === 'http.client');

    expect(clientSpan).toBeDefined();
    expect(clientSpan?.origin).toBe('auto.http.fetch');
  });
});
