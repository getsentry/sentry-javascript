import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test.describe.configure({ mode: 'serial' });

test('Sends parameterized transaction name to Sentry', async ({ page }) => {
  const transactionPromise = waitForTransaction('create-remix-app-express', transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'http.server';
  });

  await page.goto('/user/123');

  const transaction = await transactionPromise;

  expect(transaction).toBeDefined();
  expect(transaction.transaction).toBe('GET user/:id');
});

test('Sends form data with action span', async ({ page }) => {
  const formdataActionTransaction = waitForTransaction('create-remix-app-express', transactionEvent => {
    return transactionEvent?.spans?.some(span => span.data && span.data['code.function'] === 'action') || false;
  });

  await page.goto('/action-formdata');

  await page.fill('input[name=text]', 'test');
  await page.setInputFiles('input[type=file]', {
    name: 'file.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('this is test'),
  });

  await page.locator('button[type=submit]').click();

  const actionSpan = (await formdataActionTransaction)?.spans?.find(
    span => span.data && span.data['code.function'] === 'action',
  );

  expect(actionSpan).toBeDefined();
  expect(actionSpan?.op).toBe('action.remix');
  expect(actionSpan?.data).toMatchObject({
    'formData.text': 'test',
    'formData.file': 'file.txt',
  });
});

test('Sends a loader span to Sentry', async ({ page }) => {
  const loaderTransactionPromise = waitForTransaction('create-remix-app-express', transactionEvent => {
    return transactionEvent?.spans?.some(span => span.data && span.data['code.function'] === 'loader') || false;
  });

  await page.goto('/');

  const loaderSpan = (await loaderTransactionPromise)?.spans?.find(
    span => span.data && span.data['code.function'] === 'loader',
  );

  expect(loaderSpan).toBeDefined();
  expect(loaderSpan?.op).toBe('loader.remix');
});

test('Propagates trace when ErrorBoundary is triggered', async ({ page }) => {
  // We use this to identify the transactions
  const testTag = crypto.randomUUID();

  const httpServerTransactionPromise = waitForTransaction('create-remix-app-express', transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'http.server' && transactionEvent.tags?.['sentry_test'] === testTag;
  });

  const pageLoadTransactionPromise = waitForTransaction('create-remix-app-express', transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'pageload' && transactionEvent.tags?.['sentry_test'] === testTag;
  });

  page.goto(`/client-error?tag=${testTag}`);

  const pageloadTransaction = await pageLoadTransactionPromise;
  const httpServerTransaction = await httpServerTransactionPromise;

  expect(pageloadTransaction).toBeDefined();
  expect(httpServerTransaction).toBeDefined();

  const httpServerTraceId = httpServerTransaction.contexts?.trace?.trace_id;
  const httpServerSpanId = httpServerTransaction.contexts?.trace?.span_id;
  const loaderSpanId = httpServerTransaction?.spans?.find(
    span => span.data && span.data['code.function'] === 'loader',
  )?.span_id;

  const pageLoadTraceId = pageloadTransaction.contexts?.trace?.trace_id;
  const pageLoadSpanId = pageloadTransaction.contexts?.trace?.span_id;
  const pageLoadParentSpanId = pageloadTransaction.contexts?.trace?.parent_span_id;

  expect(httpServerTransaction.transaction).toBe('GET client-error');
  expect(pageloadTransaction.transaction).toBe('/client-error');

  expect(httpServerTraceId).toBeDefined();
  expect(httpServerSpanId).toBeDefined();

  expect(pageLoadTraceId).toEqual(httpServerTraceId);
  expect(pageLoadParentSpanId).toEqual(loaderSpanId);
  expect(pageLoadSpanId).not.toEqual(httpServerSpanId);
});

test('Sends two linked transactions (server & client) to Sentry', async ({ page }) => {
  // We use this to identify the transactions
  const testTag = crypto.randomUUID();

  const httpServerTransactionPromise = waitForTransaction('create-remix-app-express', transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'http.server' && transactionEvent.tags?.['sentry_test'] === testTag;
  });

  const pageLoadTransactionPromise = waitForTransaction('create-remix-app-express', transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'pageload' && transactionEvent.tags?.['sentry_test'] === testTag;
  });

  page.goto(`/?tag=${testTag}`);

  const pageloadTransaction = await pageLoadTransactionPromise;
  const httpServerTransaction = await httpServerTransactionPromise;

  expect(pageloadTransaction).toBeDefined();
  expect(httpServerTransaction).toBeDefined();

  const httpServerTraceId = httpServerTransaction.contexts?.trace?.trace_id;
  const httpServerSpanId = httpServerTransaction.contexts?.trace?.span_id;

  const loaderSpan = httpServerTransaction?.spans?.find(span => span.data && span.data['code.function'] === 'loader');
  const loaderSpanId = loaderSpan?.span_id;
  const loaderParentSpanId = loaderSpan?.parent_span_id;

  const pageLoadTraceId = pageloadTransaction.contexts?.trace?.trace_id;
  const pageLoadSpanId = pageloadTransaction.contexts?.trace?.span_id;
  const pageLoadParentSpanId = pageloadTransaction.contexts?.trace?.parent_span_id;

  expect(httpServerTransaction.transaction).toBe('GET http://localhost:3030/');
  expect(pageloadTransaction.transaction).toBe('/');

  expect(httpServerTraceId).toBeDefined();
  expect(httpServerSpanId).toBeDefined();

  expect(loaderParentSpanId).toEqual(httpServerSpanId);
  expect(pageLoadTraceId).toEqual(httpServerTraceId);
  expect(pageLoadParentSpanId).toEqual(loaderSpanId);
  expect(pageLoadSpanId).not.toEqual(httpServerSpanId);
});
