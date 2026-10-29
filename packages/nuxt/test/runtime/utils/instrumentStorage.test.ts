import { createTransport, getCurrentScope, spanToJSON, startSpan } from '@sentry/core';
import { ServerRuntimeClient } from '@sentry/core/server';
import type { Driver, Storage } from 'unstorage';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStoragePlugin } from '../../../src/runtime/utils/instrumentStorage';

describe('createStoragePlugin', () => {
  const startedSpans: string[] = [];

  beforeEach(() => {
    startedSpans.length = 0;

    const client = new ServerRuntimeClient({
      dsn: 'https://public@dsn.ingest.sentry.io/1337',
      integrations: [],
      transport: () => createTransport({ recordDroppedEvent: () => undefined }, () => Promise.resolve({})),
      stackParser: () => [],
      tracesSampleRate: 1,
    });
    getCurrentScope().setClient(client);
    client.init();
    client.on('spanStart', span => startedSpans.push(spanToJSON(span).name));
  });

  afterEach(() => {
    getCurrentScope().setClient(undefined);
  });

  it('only creates cache spans when there is an active parent span', async () => {
    const driver = { name: 'memory', getItem: vi.fn() } as unknown as Driver;
    const storage = { getMounts: () => [{ base: 'cache:', driver }], mount: vi.fn() } as unknown as Storage;
    await createStoragePlugin(() => storage, []);

    await driver.getItem('outside', {});
    await startSpan({ name: 'parent' }, () => driver.getItem('inside', {}));

    expect(startedSpans).toEqual(['parent', 'cache.get']);
  });
});
