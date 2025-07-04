import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';

test('Sends a transaction for a request to app router', async ({ page }) => {
  const serverComponentTransactionPromise = waitForTransaction('nextjs-app-dir', transactionEvent => {
    return (
      transactionEvent?.transaction === 'GET /server-component/parameter/[...parameters]' &&
      transactionEvent.contexts?.trace?.data?.['http.target'].startsWith('/server-component/parameter/1337/42')
    );
  });

  await page.goto('/server-component/parameter/1337/42');

  const transactionEvent = await serverComponentTransactionPromise;

  expect(transactionEvent.contexts?.trace).toEqual({
    data: expect.objectContaining({
      'sentry.op': 'http.server',
      'sentry.origin': 'auto',
      'sentry.sample_rate': 1,
      'sentry.source': 'route',
      'http.method': 'GET',
      'http.response.status_code': 200,
      'http.route': '/server-component/parameter/[...parameters]',
      'http.status_code': 200,
      'http.target': '/server-component/parameter/1337/42',
      'otel.kind': 'SERVER',
      'next.route': '/server-component/parameter/[...parameters]',
    }),
    op: 'http.server',
    origin: 'auto',
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    status: 'ok',
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
  });

  expect(transactionEvent.request).toEqual({
    cookies: {},
    headers: expect.objectContaining({
      'user-agent': expect.any(String),
    }),
    url: expect.stringContaining('/server-component/parameter/1337/42'),
  });

  // The transaction should not contain any spans with the same name as the transaction
  // e.g. "GET /server-component/parameter/[...parameters]"
  expect(
    transactionEvent.spans?.filter(span => {
      return span.description === transactionEvent.transaction;
    }),
  ).toHaveLength(0);
});

test('Should not set an error status on an app router transaction when it redirects', async ({ page }) => {
  const serverComponentTransactionPromise = waitForTransaction('nextjs-app-dir', async transactionEvent => {
    return transactionEvent?.transaction === 'GET /server-component/redirect';
  });

  await page.goto('/server-component/redirect');

  const transactionEvent = await serverComponentTransactionPromise;

  expect(transactionEvent.contexts?.trace?.status).not.toBe('internal_error');
});

test('Should set a "not_found" status on a server component span when notFound() is called and the request span should have status ok', async ({
  page,
}) => {
  const serverComponentTransactionPromise = waitForTransaction('nextjs-app-dir', async transactionEvent => {
    return transactionEvent?.transaction === 'GET /server-component/not-found';
  });

  await page.goto('/server-component/not-found');

  const transactionEvent = await serverComponentTransactionPromise;

  // Transaction should have status ok, because the http status is ok, but the server component span should be not_found
  expect(transactionEvent.contexts?.trace?.status).toBe('ok');
  expect(transactionEvent.spans).toContainEqual(
    expect.objectContaining({
      description: 'Page Server Component (/server-component/not-found)',
      op: 'function.nextjs',
      status: 'not_found',
      data: expect.objectContaining({
        'sentry.nextjs.ssr.function.type': 'Page',
        'sentry.nextjs.ssr.function.route': '/server-component/not-found',
      }),
    }),
  );
});

test('Should capture an error and transaction for a app router page', async ({ page }) => {
  const transactionEventPromise = waitForTransaction('nextjs-app-dir', async transactionEvent => {
    return transactionEvent?.transaction === 'GET /server-component/faulty';
  });

  const errorEventPromise = waitForError('nextjs-app-dir', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'I am a faulty server component';
  });

  await page.goto('/server-component/faulty');

  const transactionEvent = await transactionEventPromise;
  const errorEvent = await errorEventPromise;

  // Error event should have the right transaction name
  expect(errorEvent.transaction).toBe(`Page Server Component (/server-component/faulty)`);

  // Transaction should have status ok, because the http status is ok, but the server component span should be internal_error
  expect(transactionEvent.contexts?.trace?.status).toBe('ok');
  expect(transactionEvent.spans).toContainEqual(
    expect.objectContaining({
      description: 'Page Server Component (/server-component/faulty)',
      op: 'function.nextjs',
      status: 'internal_error',
      data: expect.objectContaining({
        'sentry.nextjs.ssr.function.type': 'Page',
        'sentry.nextjs.ssr.function.route': '/server-component/faulty',
      }),
    }),
  );

  expect(errorEvent.tags?.['my-isolated-tag']).toBe(true);
  expect(errorEvent.tags?.['my-global-scope-isolated-tag']).not.toBeDefined();
  expect(transactionEvent.tags?.['my-isolated-tag']).toBe(true);
  expect(transactionEvent.tags?.['my-global-scope-isolated-tag']).not.toBeDefined();

  // Modules are set for Next.js
  expect(errorEvent.modules).toEqual(
    expect.objectContaining({
      '@sentry/nextjs': expect.any(String),
      '@playwright/test': expect.any(String),
    }),
  );
});

test('Should not throw error on server component when importing shimmed feature flag function', async ({ page }) => {
  await page.goto('/server-component/featureFlag');
  // tests that none of the feature flag functions throw an error when imported in a node environment
  await expect(page.locator('body')).toContainText('FeatureFlagServerComponent');
});
