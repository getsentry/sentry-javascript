import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('mysql queries emit a db span with orchestrion-channel attributes', async ({ baseURL }) => {
  // Each incoming request gets a Sentry http.server transaction (via the
  // default denoServeIntegration); the mysql queries run inside it, so their
  // db spans attach to that transaction.
  const transactionPromise = waitForTransaction('deno-mysql', event => {
    return (
      event?.contexts?.trace?.op === 'http.server' &&
      (event.request?.url ?? '').includes('/test-mysql') &&
      (event.spans?.some(span => span.op === 'db') ?? false)
    );
  });

  const res = await fetch(`${baseURL}/test-mysql`);
  expect(res.status).toBe(200);
  await res.json();

  const transaction = await transactionPromise;
  const dbSpans = transaction.spans!.filter(span => span.op === 'db');

  const firstQuery = dbSpans.find(span => span.description === 'SELECT 1 + 1 AS solution');
  expect(firstQuery).toBeDefined();
  expect(firstQuery!.data?.['sentry.origin']).toBe('auto.db.orchestrion.mysql');
  expect(firstQuery!.data?.['db.system']).toBe('mysql');
  expect(firstQuery!.data?.['db.statement']).toBe('SELECT 1 + 1 AS solution');
  expect(firstQuery!.data?.['net.peer.port']).toBe(3306);
  expect(firstQuery!.data?.['db.user']).toBe('root');
});

test('a nested query lands on the same transaction (AsyncLocalStorage context restored)', async ({ baseURL }) => {
  // The second query runs inside the first query's callback — i.e. across
  // mysql's async socket-callback dispatch. Both spans appearing on the SAME
  // http.server transaction proves denoMysqlIntegration's context strategy
  // restored the parent span across that async boundary (otherwise the nested
  // query would start its own trace and never join this transaction).
  const transactionPromise = waitForTransaction('deno-mysql', event => {
    return (
      event?.contexts?.trace?.op === 'http.server' &&
      (event.request?.url ?? '').includes('/test-mysql') &&
      (event.spans?.filter(span => span.op === 'db').length ?? 0) >= 2
    );
  });

  const res = await fetch(`${baseURL}/test-mysql`);
  expect(res.status).toBe(200);
  await res.json();

  const transaction = await transactionPromise;
  const descriptions = transaction.spans!.filter(span => span.op === 'db').map(span => span.description);
  expect(descriptions).toContain('SELECT 1 + 1 AS solution');
  expect(descriptions).toContain('SELECT NOW()');
});
