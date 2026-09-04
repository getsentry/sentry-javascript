import { expect, test } from '@playwright/test';
import { collectStreamedSpansUntilSegment, getSpanOp } from '@sentry-internal/test-utils';
import { APP_NAME } from '../constants';

// Same spans in both runs, from two injectors: the build-time transform in the server bundle, and
// the runtime hook in `react-router dev`, where the drivers stay on Node's own loader.
test.describe('server - orchestrion db instrumentation', () => {
  test('instruments ioredis automatically via orchestrion', async ({ page }) => {
    const spansPromise = collectStreamedSpansUntilSegment(APP_NAME, 'GET /performance/db-ioredis');

    await page.goto('/performance/db-ioredis');

    const spans = await spansPromise;
    const segmentSpan = spans.find(span => span.name === 'GET /performance/db-ioredis' && span.is_segment)!;

    // The server segment must come from the native instrumentation API (not the legacy handler),
    // proving the orchestrion-injected db spans share context with the React Router server span.
    expect(getSpanOp(segmentSpan)).toBe('http.server');
    expect(segmentSpan.attributes['sentry.origin']?.value).toBe('auto.http.react_router.instrumentation_api');

    const childSpans = spans.filter(span => !span.is_segment);

    // Under span streaming a redis span is named after the operation and the connection — the key
    // it acts on is unbounded, so it stays on `db.query.text`. The route builds its client without
    // a host or port, so ioredis' own `localhost:6379` defaults are what the name reports.
    expect(childSpans).toContainEqual(
      expect.objectContaining({
        name: 'set localhost:6379',
        status: 'ok',
        attributes: expect.objectContaining({
          'sentry.op': { value: 'db.query', type: 'string' },
          'sentry.origin': { value: 'auto.db.redis', type: 'string' },
          'db.system.name': { value: 'redis', type: 'string' },
          'db.operation.name': { value: 'set', type: 'string' },
          'db.query.text': { value: 'set test-key [1 other arguments]', type: 'string' },
          'server.address': { value: 'localhost', type: 'string' },
          'server.port': { value: 6379, type: 'integer' },
        }),
      }),
    );
    expect(childSpans).toContainEqual(
      expect.objectContaining({
        name: 'get localhost:6379',
        status: 'ok',
        attributes: expect.objectContaining({
          'sentry.op': { value: 'db.query', type: 'string' },
          'sentry.origin': { value: 'auto.db.redis', type: 'string' },
          'db.system.name': { value: 'redis', type: 'string' },
          'db.operation.name': { value: 'get', type: 'string' },
          'db.query.text': { value: 'get test-key', type: 'string' },
          'server.address': { value: 'localhost', type: 'string' },
          'server.port': { value: 6379, type: 'integer' },
        }),
      }),
    );

    // Each command maps to exactly one span (no offline-queue duplicate).
    const setSpans = spans.filter(
      span => span.attributes['db.query.text']?.value === 'set test-key [1 other arguments]',
    );
    expect(setSpans).toHaveLength(1);

    // Every db span nests under the native instrumentation-API http.server segment.
    const spanIds = new Set(spans.filter(span => span.trace_id === segmentSpan.trace_id).map(span => span.span_id));
    const dbSpans = spans.filter(span => span.attributes['sentry.origin']?.value === 'auto.db.redis');
    expect(dbSpans.every(span => typeof span.parent_span_id === 'string' && spanIds.has(span.parent_span_id))).toBe(
      true,
    );
  });

  // Under span streaming the mysql span name is the query summary, so both queries below are named
  // `SELECT`. `db.query.text` is what tells them apart.
  test('instruments mysql automatically via orchestrion', async ({ page }) => {
    const spansPromise = collectStreamedSpansUntilSegment(APP_NAME, 'GET /performance/db-mysql');

    await page.goto('/performance/db-mysql');

    const spans = await spansPromise;

    for (const queryText of ['SELECT 1 + 1 AS solution', 'SELECT NOW()']) {
      expect(spans).toContainEqual(
        expect.objectContaining({
          name: 'SELECT',
          status: 'ok',
          attributes: expect.objectContaining({
            'sentry.op': { value: 'db', type: 'string' },
            'sentry.origin': { value: 'auto.db.mysql', type: 'string' },
            'db.system.name': { value: 'mysql', type: 'string' },
            'db.query.text': { value: queryText, type: 'string' },
            'db.user': { value: 'root', type: 'string' },
            'db.connection_string': { value: expect.any(String), type: 'string' },
            'server.address': { value: expect.any(String), type: 'string' },
            'server.port': { value: 3306, type: 'integer' },
          }),
        }),
      );
    }
  });
});
