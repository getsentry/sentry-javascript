import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Sends a transaction for a request to app router with URL', async ({ page }) => {
  const serverComponentTransactionPromise = waitForTransaction('nextjs-16-cf-workers', transactionEvent => {
    return (
      transactionEvent?.transaction === 'GET /parameterized/[one]/beep/[two]' &&
      transactionEvent.contexts?.trace?.data?.['http.target']?.startsWith('/parameterized/1337/beep/42')
    );
  });

  await page.goto('/parameterized/1337/beep/42');

  const transactionEvent = await serverComponentTransactionPromise;

  // On Cloudflare Workers, we don't get http.response.status_code or http.status_code
  expect(transactionEvent.contexts?.trace).toEqual({
    data: expect.objectContaining({
      'sentry.op': 'http.server',
      'sentry.origin': 'auto',
      'sentry.sample_rate': 1,
      'sentry.source': 'route',
      'http.method': 'GET',
      'http.route': '/parameterized/[one]/beep/[two]',
      'http.target': '/parameterized/1337/beep/42',
      'otel.kind': 'SERVER',
      'next.route': '/parameterized/[one]/beep/[two]',
    }),
    op: 'http.server',
    origin: 'auto',
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    status: 'ok',
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
  });

  expect(transactionEvent.request).toMatchObject({
    url: expect.stringContaining('/parameterized/1337/beep/42'),
  });

  // The transaction should not contain any spans with the same name as the transaction
  // e.g. "GET /parameterized/[one]/beep/[two]"
  expect(
    transactionEvent.spans?.filter(span => {
      return span.description === transactionEvent.transaction;
    }),
  ).toHaveLength(0);
});

test('Will create a transaction with spans for every server component and metadata generation functions when visiting a page', async ({
  page,
}) => {
  const serverTransactionEventPromise = waitForTransaction('nextjs-16-cf-workers', async transactionEvent => {
    return transactionEvent?.transaction === 'GET /nested-layout';
  });

  await page.goto('/nested-layout');

  const spanDescriptions = (await serverTransactionEventPromise).spans?.map(span => {
    return span.description;
  });

  // On Cloudflare Workers, we get different spans compared to Node.js
  // These spans are available:
  expect(spanDescriptions).toContainEqual('render route (app) /nested-layout');
  expect(spanDescriptions).toContainEqual('build component tree');
  expect(spanDescriptions).toContainEqual('generateMetadata /(nested-layout)/nested-layout/page');
  expect(spanDescriptions).toContainEqual('start response');

  // These spans use "resolve segment modules" instead of specific component names on Cloudflare
  expect(spanDescriptions?.filter(desc => desc === 'resolve segment modules').length).toBeGreaterThan(0);
});

test('Will create a transaction with spans for every server component and metadata generation functions when visiting a dynamic page', async ({
  page,
}) => {
  const serverTransactionEventPromise = waitForTransaction('nextjs-16-cf-workers', async transactionEvent => {
    return transactionEvent?.transaction === 'GET /nested-layout/[dynamic]';
  });

  await page.goto('/nested-layout/123');

  const spanDescriptions = (await serverTransactionEventPromise).spans?.map(span => {
    return span.description;
  });

  // On Cloudflare Workers, we get different spans compared to Node.js
  expect(spanDescriptions).toContainEqual('resolve page components');
  expect(spanDescriptions).toContainEqual('render route (app) /nested-layout/[dynamic]');
  expect(spanDescriptions).toContainEqual('build component tree');
  expect(spanDescriptions).toContainEqual('generateMetadata /(nested-layout)/nested-layout/[dynamic]/page');
  expect(spanDescriptions).toContainEqual('start response');

  // These spans use "resolve segment modules" instead of specific component names on Cloudflare
  expect(spanDescriptions?.filter(desc => desc === 'resolve segment modules').length).toBeGreaterThan(0);
});
