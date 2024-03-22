import { expect, test } from '@playwright/test';
import { waitForTransaction } from '../event-proxy-server';
import { waitForInitialPageload } from './utils';

test('multiple navigations have distinguished traces', async ({ page }) => {
  await waitForInitialPageload(page);

  const clientNavigation1TxnEventPromise = waitForTransaction('sveltekit-2', txnEvent => {
    return txnEvent?.transaction === '/nav-1' && txnEvent.contexts?.trace?.op === 'navigation';
  });

  const clientNavigation2TxnEventPromise = waitForTransaction('sveltekit-2', txnEvent => {
    return txnEvent?.transaction === '/' && txnEvent.contexts?.trace?.op === 'navigation';
  });

  const clientNavigation3TxnEventPromise = waitForTransaction('sveltekit-2', txnEvent => {
    return txnEvent?.transaction === '/nav-2' && txnEvent.contexts?.trace?.op === 'navigation';
  });

  // navigation to nav-1
  const clickNav1Promise = page.getByText('Navigation span 1').click();

  const [navigationEvent1] = await Promise.all([clientNavigation1TxnEventPromise, clickNav1Promise]);
  const traceId1 = navigationEvent1.contexts?.trace?.trace_id;

  // navigation back to root
  const backPromise = page.goBack();
  const [navigationEvent2] = await Promise.all([clientNavigation2TxnEventPromise, backPromise]);
  const traceId2 = navigationEvent2.contexts?.trace?.trace_id;

  // navigation to nav-2
  const clickNav2Promise = page.getByText('Navigation span 2').click();
  const [navigationEvent3] = await Promise.all([clientNavigation3TxnEventPromise, clickNav2Promise]);
  const traceId3 = navigationEvent3.contexts?.trace?.trace_id;

  expect(traceId1).toEqual(expect.any(String));
  expect(traceId2).toEqual(expect.any(String));
  expect(traceId3).toEqual(expect.any(String));

  expect(traceId1).not.toEqual(traceId2);
  expect(traceId2).not.toEqual(traceId3);
  expect(traceId1).not.toEqual(traceId3);
});
