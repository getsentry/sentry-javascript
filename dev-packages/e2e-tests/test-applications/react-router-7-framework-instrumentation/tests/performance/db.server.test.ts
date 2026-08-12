import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';
import { APP_NAME } from '../constants';

// Orchestrion injects `diagnostics_channel` publishers at build time, so these spans only exist in the
// bundled server build. `react-router dev` serves an unbundled SSR pipeline where the transform never
// runs, so the assertions are meaningless there — skip them in the dev run.
const isDev = process.env.TEST_ENV === 'development';

test.describe('server - orchestrion build-time db instrumentation', () => {
  test.skip(isDev, 'orchestrion only injects into the bundled server build, not the dev server');

  test('instruments ioredis automatically via orchestrion', async ({ page }) => {
    const transactionEventPromise = waitForTransaction(APP_NAME, transactionEvent => {
      return (
        transactionEvent.contexts?.trace?.op === 'http.server' &&
        transactionEvent.transaction === 'GET /performance/db-ioredis'
      );
    });

    await page.goto('/performance/db-ioredis');

    const transactionEvent = await transactionEventPromise;
    const spans = transactionEvent.spans || [];

    // The server transaction must come from the native instrumentation API (not the legacy handler),
    // proving the orchestrion-injected db spans share context with the React Router server span.
    expect(transactionEvent.contexts?.trace?.origin).toBe('auto.http.react_router.instrumentation_api');

    expect(spans).toContainEqual(
      expect.objectContaining({
        op: 'db.query',
        origin: 'auto.db.redis',
        description: 'set test-key [1 other arguments]',
        status: 'ok',
        data: expect.objectContaining({
          'db.system.name': 'redis',
          'db.operation.name': 'set',
          'db.query.text': 'set test-key [1 other arguments]',
        }),
      }),
    );
    expect(spans).toContainEqual(
      expect.objectContaining({
        op: 'db.query',
        origin: 'auto.db.redis',
        description: 'get test-key',
        status: 'ok',
        data: expect.objectContaining({
          'db.system.name': 'redis',
          'db.operation.name': 'get',
          'db.query.text': 'get test-key',
        }),
      }),
    );

    // Each command maps to exactly one span (no offline-queue duplicate).
    const setSpans = spans.filter(span => span.description === 'set test-key [1 other arguments]');
    expect(setSpans).toHaveLength(1);

    // Every db span nests under the native instrumentation-API http.server transaction.
    const rootSpanId = transactionEvent.contexts?.trace?.span_id;
    const spanIds = new Set([rootSpanId, ...spans.map(span => span.span_id)]);
    const dbSpans = spans.filter(span => span.origin === 'auto.db.redis');
    expect(dbSpans.every(span => typeof span.parent_span_id === 'string' && spanIds.has(span.parent_span_id))).toBe(
      true,
    );
  });

  test('instruments mysql automatically via orchestrion', async ({ page }) => {
    const transactionEventPromise = waitForTransaction(APP_NAME, transactionEvent => {
      return (
        transactionEvent.contexts?.trace?.op === 'http.server' &&
        transactionEvent.transaction === 'GET /performance/db-mysql'
      );
    });

    await page.goto('/performance/db-mysql');

    const transactionEvent = await transactionEventPromise;
    const spans = transactionEvent.spans || [];

    expect(spans).toContainEqual(
      expect.objectContaining({
        op: 'db',
        origin: 'auto.db.mysql',
        description: 'SELECT 1 + 1 AS solution',
        status: 'ok',
        data: expect.objectContaining({
          'db.system': 'mysql',
          'db.statement': 'SELECT 1 + 1 AS solution',
          'db.user': 'root',
          'db.connection_string': expect.any(String),
          'net.peer.name': expect.any(String),
          'net.peer.port': 3306,
        }),
      }),
    );
    expect(spans).toContainEqual(
      expect.objectContaining({
        op: 'db',
        origin: 'auto.db.mysql',
        description: 'SELECT NOW()',
        status: 'ok',
        data: expect.objectContaining({
          'db.system': 'mysql',
          'db.statement': 'SELECT NOW()',
          'db.user': 'root',
          'db.connection_string': expect.any(String),
          'net.peer.name': expect.any(String),
          'net.peer.port': 3306,
        }),
      }),
    );
  });
});
