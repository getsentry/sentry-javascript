import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';

test.describe('database integration', () => {
  test('captures db.prepare().get() span', async ({ request }) => {
    const transactionPromise = waitForTransaction('nuxt-4', transactionEvent => {
      return transactionEvent.transaction === 'GET /api/db-test';
    });

    await request.get('/api/db-test?method=prepare-get');

    const transaction = await transactionPromise;

    const dbSpan = transaction.spans?.find(span => span.op === 'db.query' && span.description?.includes('SELECT'));

    expect(dbSpan).toBeDefined();
    expect(dbSpan?.op).toBe('db.query');
    expect(dbSpan?.description).toBe('SELECT * FROM users WHERE id = ?');
    expect(dbSpan?.data?.['db.system.name']).toBe('sqlite');
    expect(dbSpan?.data?.['db.query.text']).toBe('SELECT * FROM users WHERE id = ?');
    expect(dbSpan?.data?.['sentry.origin']).toBe('auto.db.nuxt');
  });

  test('captures db.prepare().all() span', async ({ request }) => {
    const transactionPromise = waitForTransaction('nuxt-4', transactionEvent => {
      return transactionEvent.transaction === 'GET /api/db-test';
    });

    await request.get('/api/db-test?method=prepare-all');

    const transaction = await transactionPromise;

    const dbSpan = transaction.spans?.find(
      span => span.op === 'db.query' && span.description?.includes('SELECT * FROM products'),
    );

    expect(dbSpan).toBeDefined();
    expect(dbSpan?.op).toBe('db.query');
    expect(dbSpan?.description).toBe('SELECT * FROM products WHERE price > ?');
    expect(dbSpan?.data?.['db.system.name']).toBe('sqlite');
    expect(dbSpan?.data?.['db.query.text']).toBe('SELECT * FROM products WHERE price > ?');
    expect(dbSpan?.data?.['sentry.origin']).toBe('auto.db.nuxt');
  });

  test('captures db.prepare().run() span', async ({ request }) => {
    const transactionPromise = waitForTransaction('nuxt-4', transactionEvent => {
      return transactionEvent.transaction === 'GET /api/db-test';
    });

    await request.get('/api/db-test?method=prepare-run');

    const transaction = await transactionPromise;

    const dbSpan = transaction.spans?.find(
      span => span.op === 'db.query' && span.description?.includes('INSERT INTO orders'),
    );

    expect(dbSpan).toBeDefined();
    expect(dbSpan?.op).toBe('db.query');
    expect(dbSpan?.description).toBe('INSERT INTO orders (customer, amount) VALUES (?, ?)');
    expect(dbSpan?.data?.['db.system.name']).toBe('sqlite');
    expect(dbSpan?.data?.['db.query.text']).toBe('INSERT INTO orders (customer, amount) VALUES (?, ?)');
    expect(dbSpan?.data?.['sentry.origin']).toBe('auto.db.nuxt');
  });

  test('captures db.prepare().bind().all() span', async ({ request }) => {
    const transactionPromise = waitForTransaction('nuxt-4', transactionEvent => {
      return transactionEvent.transaction === 'GET /api/db-test';
    });

    await request.get('/api/db-test?method=prepare-bind');

    const transaction = await transactionPromise;

    const dbSpan = transaction.spans?.find(
      span => span.op === 'db.query' && span.description?.includes('SELECT * FROM items'),
    );

    expect(dbSpan).toBeDefined();
    expect(dbSpan?.op).toBe('db.query');
    expect(dbSpan?.description).toBe('SELECT * FROM items WHERE category = ?');
    expect(dbSpan?.data?.['db.system.name']).toBe('sqlite');
    expect(dbSpan?.data?.['db.query.text']).toBe('SELECT * FROM items WHERE category = ?');
    expect(dbSpan?.data?.['sentry.origin']).toBe('auto.db.nuxt');
  });

  test('captures db.sql template tag span', async ({ request }) => {
    const transactionPromise = waitForTransaction('nuxt-4', transactionEvent => {
      return transactionEvent.transaction === 'GET /api/db-test';
    });

    await request.get('/api/db-test?method=sql');

    const transaction = await transactionPromise;

    const dbSpan = transaction.spans?.find(
      span => span.op === 'db.query' && span.description?.includes('INSERT INTO messages'),
    );

    expect(dbSpan).toBeDefined();
    expect(dbSpan?.op).toBe('db.query');
    expect(dbSpan?.description).toContain('INSERT INTO messages');
    expect(dbSpan?.data?.['db.system.name']).toBe('sqlite');
    expect(dbSpan?.data?.['db.query.text']).toContain('INSERT INTO messages');
    expect(dbSpan?.data?.['sentry.origin']).toBe('auto.db.nuxt');
  });

  test('captures db.exec() span', async ({ request }) => {
    const transactionPromise = waitForTransaction('nuxt-4', transactionEvent => {
      return transactionEvent.transaction === 'GET /api/db-test';
    });

    await request.get('/api/db-test?method=exec');

    const transaction = await transactionPromise;

    const dbSpan = transaction.spans?.find(
      span => span.op === 'db.query' && span.description?.includes('INSERT INTO logs'),
    );

    expect(dbSpan).toBeDefined();
    expect(dbSpan?.op).toBe('db.query');
    expect(dbSpan?.description).toBe(`INSERT INTO logs (message, level) VALUES ('Test log', 'INFO')`);
    expect(dbSpan?.data?.['db.system.name']).toBe('sqlite');
    expect(dbSpan?.data?.['db.query.text']).toBe(`INSERT INTO logs (message, level) VALUES ('Test log', 'INFO')`);
    expect(dbSpan?.data?.['sentry.origin']).toBe('auto.db.nuxt');
  });

  test('captures database error and marks span as failed', async ({ request }) => {
    const errorPromise = waitForError('nuxt-4', errorEvent => {
      return !!errorEvent?.exception?.values?.[0]?.value?.includes('no such table');
    });

    const transactionPromise = waitForTransaction('nuxt-4', transactionEvent => {
      return transactionEvent.transaction === 'GET /api/db-test';
    });

    await request.get('/api/db-test?method=error').catch(() => {
      // Expected to fail
    });

    const [error, transaction] = await Promise.all([errorPromise, transactionPromise]);

    expect(error).toBeDefined();
    expect(error.exception?.values?.[0]?.value).toContain('no such table');
    expect(error.exception?.values?.[0]?.mechanism).toEqual({
      handled: false,
      type: 'auto.db.nuxt',
    });

    const dbSpan = transaction.spans?.find(
      span => span.op === 'db.query' && span.description?.includes('SELECT * FROM nonexistent_table'),
    );

    expect(dbSpan).toBeDefined();
    expect(dbSpan?.op).toBe('db.query');
    expect(dbSpan?.description).toBe('SELECT * FROM nonexistent_table WHERE invalid_column = ?');
    expect(dbSpan?.data?.['db.system.name']).toBe('sqlite');
    expect(dbSpan?.data?.['db.query.text']).toBe('SELECT * FROM nonexistent_table WHERE invalid_column = ?');
    expect(dbSpan?.data?.['sentry.origin']).toBe('auto.db.nuxt');
    expect(dbSpan?.status).toBe('internal_error');
  });

  test('captures breadcrumb for db.exec() queries', async ({ request }) => {
    const transactionPromise = waitForTransaction('nuxt-4', transactionEvent => {
      return transactionEvent.transaction === 'GET /api/db-test';
    });

    await request.get('/api/db-test?method=exec');

    const transaction = await transactionPromise;

    const dbBreadcrumb = transaction.breadcrumbs?.find(
      breadcrumb => breadcrumb.category === 'query' && breadcrumb.message?.includes('INSERT INTO logs'),
    );

    expect(dbBreadcrumb).toBeDefined();
    expect(dbBreadcrumb?.category).toBe('query');
    expect(dbBreadcrumb?.message).toBe(`INSERT INTO logs (message, level) VALUES ('Test log', 'INFO')`);
    expect(dbBreadcrumb?.data?.['db.query.text']).toBe(`INSERT INTO logs (message, level) VALUES ('Test log', 'INFO')`);
  });

  test('multiple database operations in single request create multiple spans', async ({ request }) => {
    const transactionPromise = waitForTransaction('nuxt-4', transactionEvent => {
      return transactionEvent.transaction === 'GET /api/db-test';
    });

    await request.get('/api/db-test?method=prepare-get');

    const transaction = await transactionPromise;

    const dbSpans = transaction.spans?.filter(span => span.op === 'db.query');

    expect(dbSpans).toBeDefined();
    expect(dbSpans!.length).toBeGreaterThanOrEqual(1);
  });
});
