import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp } from '@sentry-internal/test-utils';

// Streamed spans are flushed across multiple envelopes as they end, so the db child spans can arrive
// in a different envelope than the `is_segment` root span. Accumulate until the root span is seen.
function collectDbSpans() {
  return collectStreamedSpans('nuxt-3', spans =>
    spans.some(span => span.name === 'GET /api/db-multi-test' && span.is_segment),
  ).then(spans => spans.filter(span => getSpanOp(span) === 'db.query'));
}

test.describe('multiple database instances', () => {
  test('instruments default database instance', async ({ request }) => {
    const dbSpansPromise = collectDbSpans();

    await request.get('/api/db-multi-test?method=default-db');

    const dbSpans = await dbSpansPromise;
    expect(dbSpans.length).toBeGreaterThan(0);

    const selectSpan = dbSpans.find(span => span.name === 'SELECT default_table');
    expect(selectSpan).toBeDefined();
    expect(selectSpan?.attributes).toMatchObject({
      'db.query.summary': { type: 'string', value: 'SELECT default_table' },
      'db.query.text': { type: 'string', value: 'SELECT * FROM default_table WHERE id = ?' },
      'db.system.name': { type: 'string', value: 'sqlite' },
      'db.namespace': { type: 'string', value: 'db.sqlite' },
      'sentry.origin': { type: 'string', value: 'auto.db.nuxt' },
    });
  });

  test('instruments named database instance (users)', async ({ request }) => {
    const dbSpansPromise = collectDbSpans();

    await request.get('/api/db-multi-test?method=users-db');

    const dbSpans = await dbSpansPromise;
    expect(dbSpans.length).toBeGreaterThan(0);

    const selectSpan = dbSpans.find(span => span.name === 'SELECT user_profiles');
    expect(selectSpan).toBeDefined();
    expect(selectSpan?.attributes).toMatchObject({
      'db.query.summary': { type: 'string', value: 'SELECT user_profiles' },
      'db.query.text': { type: 'string', value: 'SELECT * FROM user_profiles WHERE id = ?' },
      'db.system.name': { type: 'string', value: 'sqlite' },
      'db.namespace': { type: 'string', value: 'users_db.sqlite' },
      'sentry.origin': { type: 'string', value: 'auto.db.nuxt' },
    });
  });

  test('instruments named database instance (analytics)', async ({ request }) => {
    const dbSpansPromise = collectDbSpans();

    await request.get('/api/db-multi-test?method=analytics-db');

    const dbSpans = await dbSpansPromise;
    expect(dbSpans.length).toBeGreaterThan(0);

    const selectSpan = dbSpans.find(span => span.name === 'SELECT events');
    expect(selectSpan).toBeDefined();
    expect(selectSpan?.attributes).toMatchObject({
      'db.query.summary': { type: 'string', value: 'SELECT events' },
      'db.query.text': { type: 'string', value: 'SELECT * FROM events WHERE id = ?' },
      'db.system.name': { type: 'string', value: 'sqlite' },
      'db.namespace': { type: 'string', value: 'analytics_db.sqlite' },
      'sentry.origin': { type: 'string', value: 'auto.db.nuxt' },
    });
  });

  test('instruments multiple database instances in single request', async ({ request }) => {
    const dbSpansPromise = collectDbSpans();

    await request.get('/api/db-multi-test?method=multiple-dbs');

    const dbSpans = await dbSpansPromise;
    expect(dbSpans.length).toBeGreaterThan(0);

    const sessionSpan = dbSpans.find(span => span.name === 'SELECT sessions');
    const accountSpan = dbSpans.find(span => span.name === 'SELECT accounts');
    const metricSpan = dbSpans.find(span => span.name === 'SELECT metrics');

    // Each instance keeps its own namespace, while the span name stays low cardinality
    expect(sessionSpan?.attributes).toMatchObject({
      'db.query.summary': { type: 'string', value: 'SELECT sessions' },
      'db.namespace': { type: 'string', value: 'db.sqlite' },
      'db.system.name': { type: 'string', value: 'sqlite' },
      'sentry.origin': { type: 'string', value: 'auto.db.nuxt' },
    });
    expect(accountSpan?.attributes).toMatchObject({
      'db.query.summary': { type: 'string', value: 'SELECT accounts' },
      'db.namespace': { type: 'string', value: 'users_db.sqlite' },
      'db.system.name': { type: 'string', value: 'sqlite' },
      'sentry.origin': { type: 'string', value: 'auto.db.nuxt' },
    });
    expect(metricSpan?.attributes).toMatchObject({
      'db.query.summary': { type: 'string', value: 'SELECT metrics' },
      'db.namespace': { type: 'string', value: 'analytics_db.sqlite' },
      'db.system.name': { type: 'string', value: 'sqlite' },
      'sentry.origin': { type: 'string', value: 'auto.db.nuxt' },
    });

    // All spans belong to the same trace as the request's root span
    const traceIds = new Set(dbSpans.map(span => span.trace_id));
    expect(traceIds.size).toBe(1);
  });

  test('instruments SQL template tag across multiple databases', async ({ request }) => {
    const dbSpansPromise = collectDbSpans();

    await request.get('/api/db-multi-test?method=sql-template-multi');

    const dbSpans = await dbSpansPromise;
    expect(dbSpans.length).toBeGreaterThan(0);

    const logsInsertSpan = dbSpans.find(span => span.name === 'INSERT logs');
    const auditLogsInsertSpan = dbSpans.find(span => span.name === 'INSERT audit_logs');

    expect(logsInsertSpan).toBeDefined();
    expect(logsInsertSpan?.attributes).toMatchObject({
      'db.query.summary': { type: 'string', value: 'INSERT logs' },
      'db.system.name': { type: 'string', value: 'sqlite' },
      'db.namespace': { type: 'string', value: 'db.sqlite' },
      'sentry.origin': { type: 'string', value: 'auto.db.nuxt' },
    });

    expect(auditLogsInsertSpan).toBeDefined();
    expect(auditLogsInsertSpan?.attributes).toMatchObject({
      'db.query.summary': { type: 'string', value: 'INSERT audit_logs' },
      'db.system.name': { type: 'string', value: 'sqlite' },
      'db.namespace': { type: 'string', value: 'users_db.sqlite' },
      'sentry.origin': { type: 'string', value: 'auto.db.nuxt' },
    });
  });

  test('creates correct span count for multiple database operations', async ({ request }) => {
    const dbSpansPromise = collectDbSpans();

    await request.get('/api/db-multi-test?method=multiple-dbs');

    const dbSpans = await dbSpansPromise;

    // We should have multiple spans:
    // - 3 CREATE TABLE (exec) spans
    // - 3 INSERT (exec) spans
    // - 3 SELECT (prepare + get) spans
    // Total should be at least 9 spans
    expect(dbSpans.length).toBeGreaterThanOrEqual(9);
  });
});
