import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test.describe('multiple database instances', () => {
  test('instruments default database instance', async ({ request }) => {
    const transactionPromise = waitForTransaction('nuxt-3', transactionEvent => {
      return transactionEvent.transaction === 'GET /api/db-multi-test';
    });

    await request.get('/api/db-multi-test?method=default-db');

    const transaction = await transactionPromise;

    const dbSpans = transaction.spans?.filter(span => span.op === 'db.query');

    expect(dbSpans).toBeDefined();
    expect(dbSpans!.length).toBeGreaterThan(0);

    // Check that we have the SELECT span
    const selectSpan = dbSpans?.find(span => span.description?.includes('SELECT * FROM default_table'));
    expect(selectSpan).toBeDefined();
    expect(selectSpan?.op).toBe('db.query');
    expect(selectSpan?.data?.['db.system.name']).toBe('sqlite');
    expect(selectSpan?.data?.['sentry.origin']).toBe('auto.db.nuxt');
  });

  test('instruments named database instance (users)', async ({ request }) => {
    const transactionPromise = waitForTransaction('nuxt-3', transactionEvent => {
      return transactionEvent.transaction === 'GET /api/db-multi-test';
    });

    await request.get('/api/db-multi-test?method=users-db');

    const transaction = await transactionPromise;

    const dbSpans = transaction.spans?.filter(span => span.op === 'db.query');

    expect(dbSpans).toBeDefined();
    expect(dbSpans!.length).toBeGreaterThan(0);

    // Check that we have the SELECT span from users database
    const selectSpan = dbSpans?.find(span => span.description?.includes('SELECT * FROM user_profiles'));
    expect(selectSpan).toBeDefined();
    expect(selectSpan?.op).toBe('db.query');
    expect(selectSpan?.data?.['db.system.name']).toBe('sqlite');
    expect(selectSpan?.data?.['sentry.origin']).toBe('auto.db.nuxt');
  });

  test('instruments named database instance (analytics)', async ({ request }) => {
    const transactionPromise = waitForTransaction('nuxt-3', transactionEvent => {
      return transactionEvent.transaction === 'GET /api/db-multi-test';
    });

    await request.get('/api/db-multi-test?method=analytics-db');

    const transaction = await transactionPromise;

    const dbSpans = transaction.spans?.filter(span => span.op === 'db.query');

    expect(dbSpans).toBeDefined();
    expect(dbSpans!.length).toBeGreaterThan(0);

    // Check that we have the SELECT span from analytics database
    const selectSpan = dbSpans?.find(span => span.description?.includes('SELECT * FROM events'));
    expect(selectSpan).toBeDefined();
    expect(selectSpan?.op).toBe('db.query');
    expect(selectSpan?.data?.['db.system.name']).toBe('sqlite');
    expect(selectSpan?.data?.['sentry.origin']).toBe('auto.db.nuxt');
  });

  test('instruments multiple database instances in single request', async ({ request }) => {
    const transactionPromise = waitForTransaction('nuxt-3', transactionEvent => {
      return transactionEvent.transaction === 'GET /api/db-multi-test';
    });

    await request.get('/api/db-multi-test?method=multiple-dbs');

    const transaction = await transactionPromise;

    const dbSpans = transaction.spans?.filter(span => span.op === 'db.query');

    expect(dbSpans).toBeDefined();
    expect(dbSpans!.length).toBeGreaterThan(0);

    // Check that we have spans from all three databases
    const sessionSpan = dbSpans?.find(span => span.description?.includes('SELECT * FROM sessions'));
    const accountSpan = dbSpans?.find(span => span.description?.includes('SELECT * FROM accounts'));
    const metricSpan = dbSpans?.find(span => span.description?.includes('SELECT * FROM metrics'));

    expect(sessionSpan).toBeDefined();
    expect(sessionSpan?.op).toBe('db.query');
    expect(sessionSpan?.data?.['db.system.name']).toBe('sqlite');

    expect(accountSpan).toBeDefined();
    expect(accountSpan?.op).toBe('db.query');
    expect(accountSpan?.data?.['db.system.name']).toBe('sqlite');

    expect(metricSpan).toBeDefined();
    expect(metricSpan?.op).toBe('db.query');
    expect(metricSpan?.data?.['db.system.name']).toBe('sqlite');

    // All should have the same origin
    expect(sessionSpan?.data?.['sentry.origin']).toBe('auto.db.nuxt');
    expect(accountSpan?.data?.['sentry.origin']).toBe('auto.db.nuxt');
    expect(metricSpan?.data?.['sentry.origin']).toBe('auto.db.nuxt');
  });

  test('instruments SQL template tag across multiple databases', async ({ request }) => {
    const transactionPromise = waitForTransaction('nuxt-3', transactionEvent => {
      return transactionEvent.transaction === 'GET /api/db-multi-test';
    });

    await request.get('/api/db-multi-test?method=sql-template-multi');

    const transaction = await transactionPromise;

    const dbSpans = transaction.spans?.filter(span => span.op === 'db.query');

    expect(dbSpans).toBeDefined();
    expect(dbSpans!.length).toBeGreaterThan(0);

    // Check that we have INSERT spans from both databases
    const logsInsertSpan = dbSpans?.find(span => span.description?.includes('INSERT INTO logs'));
    const auditLogsInsertSpan = dbSpans?.find(span => span.description?.includes('INSERT INTO audit_logs'));

    expect(logsInsertSpan).toBeDefined();
    expect(logsInsertSpan?.op).toBe('db.query');
    expect(logsInsertSpan?.data?.['db.system.name']).toBe('sqlite');
    expect(logsInsertSpan?.data?.['sentry.origin']).toBe('auto.db.nuxt');

    expect(auditLogsInsertSpan).toBeDefined();
    expect(auditLogsInsertSpan?.op).toBe('db.query');
    expect(auditLogsInsertSpan?.data?.['db.system.name']).toBe('sqlite');
    expect(auditLogsInsertSpan?.data?.['sentry.origin']).toBe('auto.db.nuxt');
  });

  test('creates correct span count for multiple database operations', async ({ request }) => {
    const transactionPromise = waitForTransaction('nuxt-3', transactionEvent => {
      return transactionEvent.transaction === 'GET /api/db-multi-test';
    });

    await request.get('/api/db-multi-test?method=multiple-dbs');

    const transaction = await transactionPromise;

    const dbSpans = transaction.spans?.filter(span => span.op === 'db.query');

    // We should have multiple spans:
    // - 3 CREATE TABLE (exec) spans
    // - 3 INSERT (exec) spans
    // - 3 SELECT (prepare + get) spans
    // Total should be at least 9 spans
    expect(dbSpans).toBeDefined();
    expect(dbSpans!.length).toBeGreaterThanOrEqual(9);
  });
});
