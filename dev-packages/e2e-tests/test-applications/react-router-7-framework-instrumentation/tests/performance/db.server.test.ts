import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp } from '@sentry-internal/test-utils';
import { APP_NAME } from '../constants';

// Orchestrion injects `diagnostics_channel` publishers at build time, so these spans only exist in the
// bundled server build. `react-router dev` serves an unbundled SSR pipeline where the transform never
// runs, so the assertions are meaningless there — skip them in the dev run.
const isDev = process.env.TEST_ENV === 'development';

test.describe('server - orchestrion build-time db instrumentation', () => {
  test.skip(isDev, 'orchestrion only injects into the bundled server build, not the dev server');

  test('instruments ioredis automatically via orchestrion', async ({ page }) => {
    const spansPromise = collectStreamedSpans(APP_NAME, spans => {
      return spans.some(span => span.name === 'GET /performance/db-ioredis' && span.is_segment);
    });

    await page.goto('/performance/db-ioredis');

    const spans = await spansPromise;
    const segmentSpan = spans.find(span => span.name === 'GET /performance/db-ioredis' && span.is_segment)!;

    // The server segment must come from the native instrumentation API (not the legacy handler),
    // proving the orchestrion-injected db spans share context with the React Router server span.
    expect(getSpanOp(segmentSpan)).toBe('http.server');
    expect(segmentSpan.attributes['sentry.origin']?.value).toBe('auto.http.react_router.instrumentation_api');

    const childSpans = spans.filter(span => !span.is_segment);

    expect(childSpans).toContainEqual(
      expect.objectContaining({
        name: 'set test-key [1 other arguments]',
        status: 'ok',
        attributes: expect.objectContaining({
          'sentry.op': { value: 'db.query', type: 'string' },
          'sentry.origin': { value: 'auto.db.redis', type: 'string' },
          'db.system.name': { value: 'redis', type: 'string' },
          'db.operation.name': { value: 'set', type: 'string' },
          'db.query.text': { value: 'set test-key [1 other arguments]', type: 'string' },
        }),
      }),
    );
    expect(childSpans).toContainEqual(
      expect.objectContaining({
        name: 'get test-key',
        status: 'ok',
        attributes: expect.objectContaining({
          'sentry.op': { value: 'db.query', type: 'string' },
          'sentry.origin': { value: 'auto.db.redis', type: 'string' },
          'db.system.name': { value: 'redis', type: 'string' },
          'db.operation.name': { value: 'get', type: 'string' },
          'db.query.text': { value: 'get test-key', type: 'string' },
        }),
      }),
    );

    // Each command maps to exactly one span (no offline-queue duplicate).
    const setSpans = spans.filter(span => span.name === 'set test-key [1 other arguments]');
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
    const spansPromise = collectStreamedSpans(APP_NAME, spans => {
      return spans.some(span => span.name === 'GET /performance/db-mysql' && span.is_segment);
    });

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
