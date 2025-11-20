import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Sends a transaction for a request to app router with URL', async ({ page }) => {
  const serverComponentTransactionPromise = waitForTransaction('nextjs-15', transactionEvent => {
    return (
      transactionEvent?.transaction === 'GET /parameterized/[one]/beep/[two]' &&
      transactionEvent.contexts?.trace?.data?.['http.target']?.startsWith('/parameterized/1337/beep/42')
    );
  });

  await page.goto('/parameterized/1337/beep/42');

  const transactionEvent = await serverComponentTransactionPromise;

  expect(transactionEvent.contexts?.trace).toEqual({
    data: expect.objectContaining({
      'sentry.op': 'http.server',
      'sentry.origin': 'auto',
      'sentry.sample_rate': 1,
      'sentry.source': 'route',
      'http.method': 'GET',
      'http.response.status_code': 200,
      'http.route': '/parameterized/[one]/beep/[two]',
      'http.status_code': 200,
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
