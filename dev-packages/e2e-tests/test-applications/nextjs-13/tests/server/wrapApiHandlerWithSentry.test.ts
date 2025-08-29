import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

const cases = [
  {
    name: 'wrappedNoParamURL',
    url: `/api/no-params`,
    transactionName: 'GET /api/no-params',
  },
  {
    name: 'wrappedDynamicURL',
    url: `/api/dog`,
    transactionName: 'GET /api/[param]',
  },
  {
    name: 'wrappedCatchAllURL',
    url: `/api/params/dog/bug`,
    transactionName: 'GET /api/params/[...pathParts]',
  },
];

cases.forEach(({ name, url, transactionName }) => {
  test(`Should capture transactions for routes with various shapes (${name})`, async ({ request }) => {
    const transactionEventPromise = waitForTransaction('nextjs-13', transactionEvent => {
      return (
        transactionEvent.transaction === transactionName &&
        transactionEvent.contexts?.trace?.op === 'http.server' &&
        transactionEvent.transaction_info?.source === 'route'
      );
    });

    request.get(url).catch(() => {
      // we don't care about crashes
    });

    expect(await transactionEventPromise).toMatchObject({
      contexts: {
        trace: {
          data: {
            'http.response.status_code': 200,
            'sentry.op': 'http.server',
            'sentry.origin': 'auto.http.nextjs',
            'sentry.source': 'route',
          },
          op: 'http.server',
          origin: 'auto.http.nextjs',
          span_id: expect.stringMatching(/[a-f0-9]{16}/),
          status: 'ok',
          trace_id: expect.stringMatching(/[a-f0-9]{32}/),
        },
      },
      platform: 'node',
      request: {
        url: expect.stringContaining(url),
      },
      start_timestamp: expect.any(Number),
      timestamp: expect.any(Number),
      transaction: transactionName,
      transaction_info: { source: 'route' },
      type: 'transaction',
    });
  });
});
