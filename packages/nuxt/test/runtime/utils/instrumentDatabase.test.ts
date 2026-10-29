import { createTransport, getCurrentScope, spanToJSON, startSpan } from '@sentry/core';
import { ServerRuntimeClient } from '@sentry/core/server';
import type { Database } from 'db0';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabasePlugin } from '../../../src/runtime/utils/instrumentDatabase';

describe('createDatabasePlugin', () => {
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

  it('only creates db spans when there is an active parent span', async () => {
    const db = { dialect: 'sqlite', exec: vi.fn(), sql: vi.fn(), prepare: vi.fn() } as unknown as Database;
    createDatabasePlugin(() => db, { default: {} });

    await db.exec('SELECT * FROM users');
    await startSpan({ name: 'parent' }, () => db.exec('SELECT * FROM orders'));

    expect(startedSpans).toEqual(['parent', 'SELECT orders']);
  });
});
