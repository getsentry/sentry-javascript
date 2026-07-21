import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';

const APP = 'cloudflare-autoinstrument';

test('auto-wrapped default export produces an http.server transaction', async ({ baseURL }) => {
  // The worker entry is a plain, unwrapped `export default {...}`. Receiving a
  // transaction proves the Vite plugin wrapped it with `withSentry` at build time.
  const transactionPromise = waitForTransaction(APP, event => {
    return (
      event?.contexts?.trace?.op === 'http.server' && (event.request?.url ?? '').includes('/test-worker-transaction')
    );
  });

  const res = await fetch(`${baseURL}/test-worker-transaction`);
  expect(res.status).toBe(200);

  const transaction = await transactionPromise;
  expect(transaction.contexts?.trace?.op).toBe('http.server');
});

test('auto-wrapped Durable Object produces its own transaction', async ({ baseURL }) => {
  // The `Counter` DO is exported unwrapped. Its `fetch` handler is instrumented
  // through the same request wrapper as the worker entry, so the transaction
  // carries the generic `auto.http.cloudflare` origin rather than a DO-specific
  // one. What proves the DO itself was wrapped is the storage span: it only
  // exists because the plugin wrapped `Counter` with
  // `instrumentDurableObjectWithSentry`, which instruments `ctx.storage`.
  const doTransactionPromise = waitForTransaction(APP, event => {
    return event.spans?.some(span => span.op === 'db' && span.description === 'durable_object_storage_put') ?? false;
  });

  const res = await fetch(`${baseURL}/test-do-transaction`);
  expect(res.status).toBe(200);
  await expect(res.json()).resolves.toEqual({ count: expect.any(Number) });

  const transaction = await doTransactionPromise;
  expect(transaction.contexts?.trace?.op).toBe('http.server');
  const putSpan = transaction.spans?.find(span => span.description === 'durable_object_storage_put');
  expect(putSpan?.data?.['db.system.name']).toBe('cloudflare.durable_object.storage');
});

test('errors thrown in an auto-wrapped Durable Object are captured', async ({ baseURL }) => {
  const errorPromise = waitForError(APP, event => {
    return event.exception?.values?.[0]?.mechanism?.type === 'auto.faas.cloudflare.durable_object';
  });

  const res = await fetch(`${baseURL}/test-do-error`);
  expect(res.status).toBe(200);

  const error = await errorPromise;
  expect(error.exception?.values?.[0]?.value).toBe('Durable Object failure captured by Sentry');
});
