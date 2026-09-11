import type { TransactionEvent } from '@sentry/core';
import { createStackParser, setCurrentClient, startSpan } from '@sentry/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VercelEdgeClient } from '../src/index';
import { winterCGFetchIntegration } from '../src/integrations/wintercg-fetch';
import { getDefaultIntegrations } from '../src/sdk';

// The behavior lives in `createFetchIntegration` and is covered by
// `packages/core/test/lib/integrations/fetch.test.ts`. This only pins the wiring.
describe('winterCGFetchIntegration', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is named `Fetch` and is enabled by default', () => {
    expect(winterCGFetchIntegration().name).toBe('WinterCGFetch');
    expect(getDefaultIntegrations().map(integration => integration.name)).toContain('WinterCGFetch');
  });

  it('creates `http.client` spans with the `auto.http.wintercg_fetch` origin', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('ok')));

    const transactions: TransactionEvent[] = [];
    const client = new VercelEdgeClient({
      dsn: 'https://public@dsn.ingest.sentry.io/1337',
      tracesSampleRate: 1,
      traceLifecycle: 'static',
      integrations: [winterCGFetchIntegration()],
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
    expect(clientSpan?.origin).toBe('auto.http.wintercg_fetch');
  });
});
