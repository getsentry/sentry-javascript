import { expect, test } from '@playwright/test';
import { uuid4 } from '@sentry/utils';

import { waitForTransaction } from '@sentry-internal/test-utils';

test.describe.configure({ mode: 'serial' });

test('Sends parameterized transaction name to Sentry', async ({ page }) => {
  const transactionPromise = waitForTransaction('create-remix-app-express-legacy', transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'http.server';
  });

  await page.goto('/user/123');

  const transaction = await transactionPromise;

  expect(transaction).toBeDefined();
  expect(transaction.transaction).toBe('routes/user.$id');
});

test('Sends form data with action span to Sentry', async ({ page }) => {
  const formdataActionTransaction = waitForTransaction('create-remix-app-express-legacy', transactionEvent => {
    return transactionEvent?.spans?.some(span => span.op === 'function.remix.action');
  });

  await page.goto('/action-formdata');

  await page.fill('input[name=text]', 'test');
  await page.setInputFiles('input[type=file]', {
    name: 'file.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('this is test'),
  });

  await page.locator('button[type=submit]').click();

  const actionSpan = (await formdataActionTransaction).spans.find(span => span.op === 'function.remix.action');

  expect(actionSpan).toBeDefined();
  expect(actionSpan.op).toBe('function.remix.action');
  expect(actionSpan.data).toMatchObject({
    'remix.action_form_data.text': 'test',
    'remix.action_form_data.file': 'file.txt',
  });
});

test('Sends a loader span to Sentry', async ({ page }) => {
  const loaderTransactionPromise = waitForTransaction('create-remix-app-express-legacy', transactionEvent => {
    return transactionEvent?.spans?.some(span => span.op === 'function.remix.loader');
  });

  await page.goto('/');

  const loaderSpan = (await loaderTransactionPromise).spans.find(span => span.op === 'function.remix.loader');

  expect(loaderSpan).toBeDefined();
  expect(loaderSpan.op).toBe('function.remix.loader');
});
test('Propagates trace when ErrorBoundary is triggered', async ({ page }) => {
  // We use this to identify the transactions
  const testTag = uuid4();

  const httpServerTransactionPromise = waitForTransaction('create-remix-app-express-legacy', transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'http.server' && transactionEvent.tags?.['sentry_test'] === testTag;
  });

  const pageLoadTransactionPromise = waitForTransaction('create-remix-app-express-legacy', transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'pageload' && transactionEvent.tags?.['sentry_test'] === testTag;
  });

  page.goto(`/client-error?tag=${testTag}`);

  const pageloadTransaction = await pageLoadTransactionPromise;
  const httpServerTransaction = await httpServerTransactionPromise;

  expect(pageloadTransaction).toBeDefined();
  expect(httpServerTransaction).toBeDefined();

  const httpServerTraceId = httpServerTransaction.contexts?.trace?.trace_id;
  const httpServerSpanId = httpServerTransaction.contexts?.trace?.span_id;

  const pageLoadTraceId = pageloadTransaction.contexts?.trace?.trace_id;
  const pageLoadSpanId = pageloadTransaction.contexts?.trace?.span_id;
  const pageLoadParentSpanId = pageloadTransaction.contexts?.trace?.parent_span_id;

  expect(httpServerTransaction.transaction).toBe('routes/client-error');
  expect(pageloadTransaction.transaction).toBe('routes/client-error');

  expect(httpServerTraceId).toBeDefined();
  expect(httpServerSpanId).toBeDefined();

  expect(pageLoadTraceId).toEqual(httpServerTraceId);
  expect(pageLoadParentSpanId).toEqual(httpServerSpanId);
  expect(pageLoadSpanId).not.toEqual(httpServerSpanId);
});

test('Sends two linked transactions (server & client) to Sentry', async ({ page }) => {
  // We use this to identify the transactions
  const testTag = uuid4();

  const httpServerTransactionPromise = waitForTransaction('create-remix-app-express-legacy', transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'http.server' && transactionEvent.tags?.['sentry_test'] === testTag;
  });

  const pageLoadTransactionPromise = waitForTransaction('create-remix-app-express-legacy', transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'pageload' && transactionEvent.tags?.['sentry_test'] === testTag;
  });

  page.goto(`/?tag=${testTag}`);

  const pageloadTransaction = await pageLoadTransactionPromise;
  const httpServerTransaction = await httpServerTransactionPromise;

  expect(pageloadTransaction).toBeDefined();
  expect(httpServerTransaction).toBeDefined();

  const httpServerTraceId = httpServerTransaction.contexts?.trace?.trace_id;
  const httpServerSpanId = httpServerTransaction.contexts?.trace?.span_id;

  const pageLoadTraceId = pageloadTransaction.contexts?.trace?.trace_id;
  const pageLoadSpanId = pageloadTransaction.contexts?.trace?.span_id;
  const pageLoadParentSpanId = pageloadTransaction.contexts?.trace?.parent_span_id;

  expect(httpServerTransaction.transaction).toBe('routes/_index');
  expect(pageloadTransaction.transaction).toBe('routes/_index');

  expect(httpServerTraceId).toBeDefined();
  expect(httpServerSpanId).toBeDefined();

  expect(pageLoadTraceId).toEqual(httpServerTraceId);
  expect(pageLoadParentSpanId).toEqual(httpServerSpanId);
  expect(pageLoadSpanId).not.toEqual(httpServerSpanId);
});
