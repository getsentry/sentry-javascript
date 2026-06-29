import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('orchestrion mysql channel produces a db span with correct attributes', async ({ baseURL }) => {
  const transactionPromise = waitForTransaction('cloudflare-orchestrion', event => {
    return (
      event?.contexts?.trace?.op === 'http.server' &&
      (event.request?.url ?? '').includes('/test-mysql-channel') &&
      (event.spans?.some(span => span.op === 'db') ?? false)
    );
  });

  const res = await fetch(`${baseURL}/test-mysql-channel`);
  expect(res.status).toBe(200);

  const transaction = await transactionPromise;
  const dbSpan = transaction.spans!.find(s => s.op === 'db');

  expect(dbSpan).toBeDefined();
  expect(dbSpan!.description).toBe('SELECT 1 + 1 AS solution');
  expect(dbSpan!.data?.['db.system']).toBe('mysql');
  expect(dbSpan!.data?.['db.statement']).toBe('SELECT 1 + 1 AS solution');
  expect(dbSpan!.data?.['net.peer.name']).toBe('127.0.0.1');
  expect(dbSpan!.data?.['net.peer.port']).toBe(3306);
  expect(dbSpan!.data?.['db.user']).toBe('root');
  expect(dbSpan!.data?.['sentry.origin']).toBe('auto.db.orchestrion.mysql');
});

test('nested queries land on the same transaction', async ({ baseURL }) => {
  const transactionPromise = waitForTransaction('cloudflare-orchestrion', event => {
    return (
      event?.contexts?.trace?.op === 'http.server' &&
      (event.request?.url ?? '').includes('/test-nested-mysql-channel') &&
      (event.spans?.filter(span => span.op === 'db').length ?? 0) >= 2
    );
  });

  const res = await fetch(`${baseURL}/test-nested-mysql-channel`);
  expect(res.status).toBe(200);

  const transaction = await transactionPromise;
  const descriptions = transaction.spans!.filter(s => s.op === 'db').map(s => s.description);

  expect(descriptions).toContain('SELECT 1 + 1 AS solution');
  expect(descriptions).toContain('SELECT NOW()');
});
