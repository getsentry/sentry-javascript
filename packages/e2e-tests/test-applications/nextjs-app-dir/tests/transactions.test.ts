import { test, expect } from '@playwright/test';
import { waitForTransaction } from '../../../test-utils/event-proxy-server';
import { pollEventOnSentry } from './utils';

test('Sends an ingestable pageload transaction to Sentry', async ({ page }) => {
  const pageloadTransactionEventPromise = waitForTransaction('nextjs-13-app-dir', transactionEvent => {
    return transactionEvent?.contexts?.trace?.op === 'pageload' && transactionEvent?.transaction === '/';
  });

  await page.goto('/');

  const transactionEvent = await pageloadTransactionEventPromise;
  const transactionEventId = transactionEvent.event_id;

  expect(transactionEventId).toBeDefined();
  await pollEventOnSentry(transactionEventId!);
});

if (process.env.TEST_ENV === 'production') {
  // TODO: Fix that this is flakey on dev server - might be an SDK bug
  test('Sends a transaction for a server component', async ({ page }) => {
    const serverComponentTransactionPromise = waitForTransaction('nextjs-13-app-dir', transactionEvent => {
      return (
        transactionEvent?.contexts?.trace?.op === 'function.nextjs' &&
        transactionEvent?.transaction === 'Page Server Component (/server-component/parameter/[...parameters])'
      );
    });

    await page.goto('/server-component/parameter/1337/42');

    const transactionEvent = await serverComponentTransactionPromise;
    const transactionEventId = transactionEvent.event_id;

    expect(transactionEventId).toBeDefined();
    await pollEventOnSentry(transactionEventId!);
  });
}
