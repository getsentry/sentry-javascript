import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';

test('Sends a transaction for a server component', async ({ page }) => {
  // TODO: Fix that this is flakey on dev server - might be an SDK bug
  test.skip(process.env.TEST_ENV === 'production', 'Flakey on dev-server');

  const serverComponentTransactionPromise = waitForTransaction('nextjs-app-dir', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'function.nextjs' &&
      transactionEvent?.transaction === 'Page Server Component (/server-component/parameter/[...parameters])'
    );
  });

  await page.goto('/server-component/parameter/1337/42');

  const transactionEvent = await serverComponentTransactionPromise;

  expect(transactionEvent.contexts?.trace).toEqual({
    data: expect.objectContaining({
      'sentry.op': 'function.nextjs',
      'sentry.origin': 'auto.function.nextjs',
      'sentry.sample_rate': 1,
      'sentry.source': 'component',
    }),
    op: 'function.nextjs',
    origin: 'auto.function.nextjs',
    span_id: expect.any(String),
    status: 'ok',
    trace_id: expect.any(String),
  });

  expect(transactionEvent).toEqual(
    expect.objectContaining({
      request: {
        cookies: {},
        headers: expect.any(Object),
        url: 'http://localhost:3030',
      },
      transaction: 'Page Server Component (/server-component/parameter/[...parameters])',
      type: 'transaction',
      transaction_info: {
        source: 'component',
      },
      spans: [],
    }),
  );
});

test('Should not set an error status on a server component transaction when it redirects', async ({ page }) => {
  // TODO: Fix that this is flakey on dev server - might be an SDK bug
  test.skip(process.env.TEST_ENV === 'production', 'Flakey on dev-server');

  const serverComponentTransactionPromise = waitForTransaction('nextjs-app-dir', async transactionEvent => {
    return transactionEvent?.transaction === 'Page Server Component (/server-component/redirect)';
  });

  await page.goto('/server-component/redirect');

  const transactionEvent = await serverComponentTransactionPromise;

  expect(transactionEvent.contexts?.trace?.status).not.toBe('internal_error');
});

test('Should set a "not_found" status on a server component transaction when notFound() is called', async ({
  page,
}) => {
  // TODO: Fix that this is flakey on dev server - might be an SDK bug
  test.skip(process.env.TEST_ENV === 'production', 'Flakey on dev-server');

  const serverComponentTransactionPromise = waitForTransaction('nextjs-app-dir', async transactionEvent => {
    return transactionEvent?.transaction === 'Page Server Component (/server-component/not-found)';
  });

  await page.goto('/server-component/not-found');

  const transactionEvent = await serverComponentTransactionPromise;

  expect(transactionEvent.contexts?.trace?.status).toBe('not_found');
});

test('Should capture an error and transaction with correct status for a faulty server component', async ({ page }) => {
  const transactionEventPromise = waitForTransaction('nextjs-app-dir', async transactionEvent => {
    return transactionEvent?.transaction === 'Page Server Component (/server-component/faulty)';
  });

  const errorEventPromise = waitForError('nextjs-app-dir', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'I am a faulty server component';
  });

  await page.goto('/server-component/faulty');

  const transactionEvent = await transactionEventPromise;
  const errorEvent = await errorEventPromise;

  expect(transactionEvent.contexts?.trace?.status).toBe('internal_error');

  expect(errorEvent.transaction).toBe(`Page Server Component (/server-component/faulty)`);

  expect(errorEvent.tags?.['my-isolated-tag']).toBe(true);
  expect(errorEvent.tags?.['my-global-scope-isolated-tag']).not.toBeDefined();
  expect(transactionEvent.tags?.['my-isolated-tag']).toBe(true);
  expect(transactionEvent.tags?.['my-global-scope-isolated-tag']).not.toBeDefined();
});
