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

  console.log(JSON.stringify(spans, null, 2));

  expect(spans).toHaveLength(3);
});
