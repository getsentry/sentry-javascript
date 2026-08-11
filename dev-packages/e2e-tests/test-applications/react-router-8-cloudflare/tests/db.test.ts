import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('a real mysql query emits a db span with orchestrion-channel attributes', async ({ request }) => {
  const transactionPromise = waitForTransaction('react-router-8-cloudflare', transactionEvent => {
    return (
      transactionEvent.contexts?.trace?.op === 'http.server' &&
      (transactionEvent.spans?.some(span => span.op === 'db') ?? false)
    );
  });

  const res = await request.get('/performance/db-mysql');
  expect(res.status()).toBe(200);

  const transactionEvent = await transactionPromise;
  const dbSpans = transactionEvent.spans!.filter(span => span.op === 'db');

  const firstQuery = dbSpans.find(span => span.description === 'SELECT 1 + 1 AS solution');
  expect(firstQuery).toBeDefined();
  expect(firstQuery!.data?.['sentry.origin']).toBe('auto.db.mysql');
  expect(firstQuery!.data?.['db.system']).toBe('mysql');
  expect(firstQuery!.data?.['db.statement']).toBe('SELECT 1 + 1 AS solution');
  expect(firstQuery!.data?.['server.address']).toBe('127.0.0.1');
  expect(firstQuery!.data?.['server.port']).toBe(3306);
  expect(firstQuery!.data?.['db.user']).toBe('root');
});

test('a nested query lands on the same transaction (async context restored)', async ({ request }) => {
  const transactionPromise = waitForTransaction('react-router-8-cloudflare', transactionEvent => {
    return (
      transactionEvent.contexts?.trace?.op === 'http.server' &&
      (transactionEvent.spans?.filter(span => span.op === 'db').length ?? 0) >= 2
    );
  });

  const res = await request.get('/performance/db-mysql');
  expect(res.status()).toBe(200);

  const transactionEvent = await transactionPromise;
  const descriptions = transactionEvent.spans!.filter(span => span.op === 'db').map(span => span.description);
  expect(descriptions).toContain('SELECT 1 + 1 AS solution');
  expect(descriptions).toContain('SELECT NOW()');
});
