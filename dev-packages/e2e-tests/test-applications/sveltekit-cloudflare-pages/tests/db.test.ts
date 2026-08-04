import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('a real mysql query emits a db span with orchestrion-channel attributes', async ({ baseURL }) => {
  // The `orchestrion:mysql:query` channel is injected into the bundled `mysql` package at
  // build time by `@sentry/sveltekit`, which — because this app uses the Cloudflare adapter —
  // also registers the subscriber factory on the global marker that `@sentry/cloudflare` reads
  // in `wrapRequestHandler`. The query below therefore produces a `db` span on the request's
  // http.server transaction, with no OTel require-hook (which wouldn't work in workerd).
  const transactionPromise = waitForTransaction('sveltekit-cloudflare-pages', transactionEvent => {
    return (
      transactionEvent.contexts?.trace?.op === 'http.server' &&
      (transactionEvent.spans?.some(span => span.op === 'db') ?? false)
    );
  });

  const res = await fetch(`${baseURL}/db-mysql`);
  expect(res.status).toBe(200);

  const transactionEvent = await transactionPromise;
  const dbSpans = transactionEvent.spans!.filter(span => span.op === 'db');

  const firstQuery = dbSpans.find(span => span.description === 'SELECT 1 + 1 AS solution');
  expect(firstQuery).toBeDefined();
  expect(firstQuery!.data?.['sentry.origin']).toBe('auto.db.mysql');
  expect(firstQuery!.data?.['db.system']).toBe('mysql');
  expect(firstQuery!.data?.['db.statement']).toBe('SELECT 1 + 1 AS solution');
  expect(firstQuery!.data?.['net.peer.name']).toBe('127.0.0.1');
  expect(firstQuery!.data?.['net.peer.port']).toBe(3306);
  expect(firstQuery!.data?.['db.user']).toBe('root');
});

test('a nested query lands on the same transaction (async context restored)', async ({ baseURL }) => {
  // The second query runs inside the first query's callback — i.e. across mysql's async
  // socket-callback dispatch. Both spans appearing on the SAME http.server transaction proves
  // the channel subscriber restored the parent span across that async boundary (otherwise the
  // nested query would start its own trace and never join this transaction).
  const transactionPromise = waitForTransaction('sveltekit-cloudflare-pages', transactionEvent => {
    return (
      transactionEvent.contexts?.trace?.op === 'http.server' &&
      (transactionEvent.spans?.filter(span => span.op === 'db').length ?? 0) >= 2
    );
  });

  const res = await fetch(`${baseURL}/db-mysql`);
  expect(res.status).toBe(200);

  const transactionEvent = await transactionPromise;
  const descriptions = transactionEvent.spans!.filter(span => span.op === 'db').map(span => span.description);
  expect(descriptions).toContain('SELECT 1 + 1 AS solution');
  expect(descriptions).toContain('SELECT NOW()');
});
