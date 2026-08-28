import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp, waitForError } from '@sentry-internal/test-utils';

// Streamed spans are flushed across multiple envelopes as they end, so spans of one request arrive
// spread over several envelopes, interleaved with spans of earlier requests that are still buffered.
// Accumulate until the request's root span is seen, then keep only the spans of its trace.
//
// The root span is matched on `url.path`: with span streaming its name is only parameterized once the
// route resolves, which doesn't happen for un-parameterized routes or requests that end in an error.
async function collectDbSpans() {
  const spans = await collectStreamedSpans('nuxt-3', spans =>
    spans.some(span => span.is_segment && span.attributes['url.path']?.value === '/api/db-test'),
  );
  const rootSpan = spans.find(span => span.is_segment && span.attributes['url.path']?.value === '/api/db-test');

  return spans.filter(span => span.trace_id === rootSpan?.trace_id && getSpanOp(span) === 'db.query');
}

test.describe('database integration', () => {
  test('captures db.prepare().get() span', async ({ request }) => {
    const dbSpansPromise = collectDbSpans();

    await request.get('/api/db-test?method=prepare-get');

    const dbSpan = (await dbSpansPromise).find(span => span.name === 'SELECT users');

    expect(dbSpan).toBeDefined();
    expect(dbSpan?.status).toBe('ok');
    expect(dbSpan?.attributes).toMatchObject({
      'db.query.summary': { type: 'string', value: 'SELECT users' },
      'db.query.text': { type: 'string', value: 'SELECT * FROM users WHERE id = ?' },
      'db.system.name': { type: 'string', value: 'sqlite' },
      'db.namespace': { type: 'string', value: 'db.sqlite' },
      'sentry.op': { type: 'string', value: 'db.query' },
      'sentry.origin': { type: 'string', value: 'auto.db.nuxt' },
    });
  });

  test('captures db.prepare().all() span', async ({ request }) => {
    const dbSpansPromise = collectDbSpans();

    await request.get('/api/db-test?method=prepare-all');

    const dbSpan = (await dbSpansPromise).find(span => span.name === 'SELECT products');

    expect(dbSpan).toBeDefined();
    expect(dbSpan?.attributes).toMatchObject({
      'db.query.summary': { type: 'string', value: 'SELECT products' },
      'db.query.text': { type: 'string', value: 'SELECT * FROM products WHERE price > ?' },
      'db.system.name': { type: 'string', value: 'sqlite' },
      'sentry.origin': { type: 'string', value: 'auto.db.nuxt' },
    });
  });

  test('captures db.prepare().run() span', async ({ request }) => {
    const dbSpansPromise = collectDbSpans();

    await request.get('/api/db-test?method=prepare-run');

    const dbSpan = (await dbSpansPromise).find(span => span.name === 'INSERT orders');

    expect(dbSpan).toBeDefined();
    expect(dbSpan?.attributes).toMatchObject({
      'db.query.summary': { type: 'string', value: 'INSERT orders' },
      'db.query.text': { type: 'string', value: 'INSERT INTO orders (customer, amount) VALUES (?, ?)' },
      'db.system.name': { type: 'string', value: 'sqlite' },
      'sentry.origin': { type: 'string', value: 'auto.db.nuxt' },
    });
  });

  test('captures db.prepare().bind().all() span', async ({ request }) => {
    const dbSpansPromise = collectDbSpans();

    await request.get('/api/db-test?method=prepare-bind');

    const dbSpan = (await dbSpansPromise).find(span => span.name === 'SELECT items');

    expect(dbSpan).toBeDefined();
    expect(dbSpan?.attributes).toMatchObject({
      'db.query.summary': { type: 'string', value: 'SELECT items' },
      'db.query.text': { type: 'string', value: 'SELECT * FROM items WHERE category = ?' },
      'db.system.name': { type: 'string', value: 'sqlite' },
      'sentry.origin': { type: 'string', value: 'auto.db.nuxt' },
    });
  });

  test('captures db.sql template tag span', async ({ request }) => {
    const dbSpansPromise = collectDbSpans();

    await request.get('/api/db-test?method=sql');

    const dbSpan = (await dbSpansPromise).find(span => span.name === 'INSERT messages');

    expect(dbSpan).toBeDefined();
    expect(dbSpan?.attributes).toMatchObject({
      'db.query.summary': { type: 'string', value: 'INSERT messages' },
      'db.query.text': {
        type: 'string',
        value: 'INSERT INTO messages (content, created_at) VALUES (?, ?)',
      },
      'db.system.name': { type: 'string', value: 'sqlite' },
      'sentry.origin': { type: 'string', value: 'auto.db.nuxt' },
    });
  });

  test('captures db.exec() span', async ({ request }) => {
    const dbSpansPromise = collectDbSpans();

    await request.get('/api/db-test?method=exec');

    const dbSpans = await dbSpansPromise;
    const insertSpan = dbSpans.find(span => span.name === 'INSERT logs');

    expect(insertSpan).toBeDefined();
    expect(insertSpan?.attributes).toMatchObject({
      'db.query.summary': { type: 'string', value: 'INSERT logs' },
      'db.query.text': { type: 'string', value: `INSERT INTO logs (message, level) VALUES ('Test log', 'INFO')` },
      'db.system.name': { type: 'string', value: 'sqlite' },
      'sentry.origin': { type: 'string', value: 'auto.db.nuxt' },
    });

    // DDL statements are summarized as `{operation} {table}` as well, with the statement on the attribute
    expect(dbSpans.find(span => span.name === 'DROP TABLE logs')?.attributes).toMatchObject({
      'db.query.text': { type: 'string', value: 'DROP TABLE IF EXISTS logs' },
    });
    expect(dbSpans.find(span => span.name === 'CREATE TABLE logs')?.attributes).toMatchObject({
      'db.query.text': {
        type: 'string',
        value: 'CREATE TABLE logs (id INTEGER PRIMARY KEY, message TEXT, level TEXT)',
      },
    });
  });

  test('captures database error and marks span as failed', async ({ request }) => {
    const errorPromise = waitForError('nuxt-3', errorEvent => {
      return !!errorEvent?.exception?.values?.some(
        value => value.mechanism?.type === 'auto.db.nuxt' && value.value?.includes('no such table'),
      );
    });

    const dbSpansPromise = collectDbSpans();

    await request.get('/api/db-test?method=error').catch(() => {
      // Expected to fail
    });

    const [error, dbSpans] = await Promise.all([errorPromise, dbSpansPromise]);

    const dbException = error.exception?.values?.find(value => value.mechanism?.type === 'auto.db.nuxt');

    expect(dbException).toBeDefined();
    expect(dbException?.value).toContain('no such table');
    expect(dbException?.mechanism).toEqual({
      handled: false,
      type: 'auto.db.nuxt',
    });

    const dbSpan = dbSpans.find(span => span.name === 'SELECT nonexistent_table');

    expect(dbSpan).toBeDefined();
    expect(dbSpan?.status).toBe('error');
    expect(dbSpan?.attributes).toMatchObject({
      'db.query.summary': { type: 'string', value: 'SELECT nonexistent_table' },
      'db.query.text': { type: 'string', value: 'SELECT * FROM nonexistent_table WHERE invalid_column = ?' },
      'db.system.name': { type: 'string', value: 'sqlite' },
      'sentry.origin': { type: 'string', value: 'auto.db.nuxt' },
    });
  });

  test('captures breadcrumb for db.exec() queries', async ({ request }) => {
    const errorPromise = waitForError('nuxt-3', errorEvent => {
      return !!errorEvent?.exception?.values?.some(value => value.mechanism?.type === 'auto.db.nuxt');
    });

    await request.get('/api/db-test?method=error').catch(() => {
      // Expected to fail
    });

    const error = await errorPromise;

    const dbBreadcrumb = error.breadcrumbs?.find(
      breadcrumb => breadcrumb.category === 'query' && breadcrumb.message?.includes('INSERT INTO logs'),
    );

    expect(dbBreadcrumb).toBeDefined();
    expect(dbBreadcrumb?.message).toBe(`INSERT INTO logs (message, level) VALUES ('Test log', 'INFO')`);
    expect(dbBreadcrumb?.data?.['db.query.text']).toBe(`INSERT INTO logs (message, level) VALUES ('Test log', 'INFO')`);
  });

  test('multiple database operations in single request create multiple spans', async ({ request }) => {
    const dbSpansPromise = collectDbSpans();

    await request.get('/api/db-test?method=prepare-get');

    const dbSpans = await dbSpansPromise;

    expect(dbSpans.length).toBeGreaterThanOrEqual(1);
    expect(dbSpans.every(span => !span.is_segment)).toBe(true);
  });
});
