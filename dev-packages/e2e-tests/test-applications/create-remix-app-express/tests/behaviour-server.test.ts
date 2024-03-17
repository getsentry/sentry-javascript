import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/event-proxy-server';
import { uuid4 } from '@sentry/utils';

test('Sends a loader error to Sentry', async ({ page }) => {
  const loaderErrorPromise = waitForError('create-remix-app-express', errorEvent => {
    return errorEvent.exception.values[0].value === 'Loader Error';
  });

  await page.goto('/loader-error');

  const loaderError = await loaderErrorPromise;

  expect(loaderError).toBeDefined();
});

test('Sends form data with action error to Sentry', async ({ page }) => {
  await page.goto('/action-formdata');

  await page.fill('input[name=text]', 'test');
  await page.setInputFiles('input[type=file]', {
    name: 'file.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('this is test'),
  });

  await page.locator('button[type=submit]').click();

  const formdataActionTransaction = waitForTransaction('create-remix-app-express', transactionEvent => {
    return transactionEvent?.spans?.some(span => span.op === 'function.remix.action');
  });

  const actionTransaction = await formdataActionTransaction;

  expect(actionTransaction).toBeDefined();
  expect(actionTransaction.contexts.trace.op).toBe('http.server');
  expect(actionTransaction.spans[0].data).toMatchObject({
    action_form_data_text: 'test',
    action_form_data_file: 'file.txt',
  });
});

test('Sends two linked transactions (server & client) to Sentry', async ({ page }) => {
  // We use this to identify the transactions
  const testTag = uuid4();

  const httpServerTransactionPromise = waitForTransaction('create-remix-app-express', transactionEvent => {
    return (
      transactionEvent.type === 'transaction' &&
      transactionEvent.contexts?.trace?.op === 'http.server' &&
      transactionEvent.tags?.['sentry_test'] === testTag
    );
  });

  const pageLoadTransactionPromise = waitForTransaction('create-remix-app-express', transactionEvent => {
    return (
      transactionEvent.type === 'transaction' &&
      transactionEvent.contexts?.trace?.op === 'pageload' &&
      transactionEvent.tags?.['sentry_test'] === testTag
    );
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
