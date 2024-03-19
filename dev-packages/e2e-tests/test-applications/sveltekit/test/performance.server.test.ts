import { expect, test } from '@playwright/test';
import { waitForTransaction } from '../event-proxy-server';

test('server pageload request span has nested request span', async ({ page }) => {
  const serverTxnEventPromise = waitForTransaction('sveltekit', txnEvent => {
    console.log('txnEvent', txnEvent);
    return txnEvent?.transaction === 'GET /server-load-fetch';
  });

  await page.goto('/server-load-fetch');

  const serverTxnEvent = await serverTxnEventPromise;
  const spans = serverTxnEvent.spans;

  const outerHttpServerSpan = spans?.find(span => span.op === 'http.server' && span.description === 'GET /server-load-fetch');
  const innerHttpServerSpan = spans?.find(span => span.op === 'http.server' && span.description === 'GET /api/users');

  expect(serverTxnEvent).toMatchObject({
    transaction: 'GET /server-load-fetch',
    tags: { runtime: 'node' },
    transaction_info: { source: 'route' },
    type: 'transaction',
    contexts: {
      trace: {
        op: 'http.server',
        origin: 'auto.http.sveltekit',
      },
    },
  });

  expect(spans).toHaveLength(3);
  expect(outerHttpServerSpan).toBeDefined();
  expect(innerHttpServerSpan).toBeDefined();
});
