import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';
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
    return transactionEvent?.spans?.some(span => span.data && span.data['code.function'] === 'action');
  });

  const actionSpan = (await formdataActionTransaction).spans.find(
    span => span.data && span.data['code.function'] === 'action',
  );

  expect(actionSpan).toBeDefined();
  expect(actionSpan.op).toBe('http');
  expect(actionSpan.data).toMatchObject({
    'formData.text': 'test',
    'formData.file': 'file.txt',
  });
});

test('Sends a loader span to Sentry', async ({ page }) => {
  const loaderTransactionPromise = waitForTransaction('create-remix-app-express', transactionEvent => {
    return transactionEvent?.spans?.some(span => span.data && span.data['code.function'] === 'loader');
  });

  await page.goto('/');

  const loaderSpan = (await loaderTransactionPromise).spans.find(
    span => span.data && span.data['code.function'] === 'loader',
  );

  expect(loaderSpan).toBeDefined();
  expect(loaderSpan.op).toBe('http');
});

test('Sends two linked transactions (server & client) to Sentry', async ({ page }) => {
  // We use this to identify the transactions
  const testTag = uuid4();

  const httpServerTransactionPromise = waitForTransaction('create-remix-app-express', transactionEvent => {
    return (
      transactionEvent.type === 'transaction' &&
      transactionEvent.contexts?.trace?.op === 'http' &&
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
  const loaderSpanId = httpServerTransaction.spans.find(
    span => span.data && span.data['code.function'] === 'loader',
  )?.span_id;

  const pageLoadTraceId = pageloadTransaction.contexts?.trace?.trace_id;
  const pageLoadSpanId = pageloadTransaction.contexts?.trace?.span_id;
  const pageLoadParentSpanId = pageloadTransaction.contexts?.trace?.parent_span_id;

  expect(httpServerTransaction.transaction).toBe('GET http://localhost:3030/');
  expect(pageloadTransaction.transaction).toBe('routes/_index');

  expect(httpServerTraceId).toBeDefined();
  expect(httpServerSpanId).toBeDefined();

  expect(pageLoadTraceId).toEqual(httpServerTraceId);
  expect(pageLoadParentSpanId).toEqual(loaderSpanId);
  expect(pageLoadSpanId).not.toEqual(httpServerSpanId);
});
