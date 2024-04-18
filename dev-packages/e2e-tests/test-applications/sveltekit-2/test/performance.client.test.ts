import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/event-proxy-server';
import { waitForInitialPageload } from './utils';

test.describe('client-specific performance events', () => {
  test('multiple navigations have distinct traces', async ({ page }) => {
    const navigationTxn1EventPromise = waitForTransaction('sveltekit-2', txnEvent => {
      return txnEvent?.transaction === '/nav1' && txnEvent.contexts?.trace?.op === 'navigation';
    });

    const navigationTxn2EventPromise = waitForTransaction('sveltekit-2', txnEvent => {
      return txnEvent?.transaction === '/' && txnEvent.contexts?.trace?.op === 'navigation';
    });

    const navigationTxn3EventPromise = waitForTransaction('sveltekit-2', txnEvent => {
      return txnEvent?.transaction === '/nav2' && txnEvent.contexts?.trace?.op === 'navigation';
    });

    await waitForInitialPageload(page);

    const [navigationTxn1Event] = await Promise.all([navigationTxn1EventPromise, page.getByText('Nav 1').click()]);
    const [navigationTxn2Event] = await Promise.all([navigationTxn2EventPromise, page.goBack()]);
    const [navigationTxn3Event] = await Promise.all([navigationTxn3EventPromise, page.getByText('Nav 2').click()]);

    expect(navigationTxn1Event).toMatchObject({
      transaction: '/nav1',
      transaction_info: { source: 'route' },
      type: 'transaction',
      contexts: {
        trace: {
          op: 'navigation',
          origin: 'auto.navigation.sveltekit',
          trace_id: expect.stringMatching(/[a-f0-9]{32}/),
        },
      },
    });

    expect(navigationTxn2Event).toMatchObject({
      transaction: '/',
      transaction_info: { source: 'route' },
      type: 'transaction',
      contexts: {
        trace: {
          op: 'navigation',
          origin: 'auto.navigation.sveltekit',
          trace_id: expect.stringMatching(/[a-f0-9]{32}/),
        },
      },
    });

    expect(navigationTxn3Event).toMatchObject({
      transaction: '/nav2',
      transaction_info: { source: 'route' },
      type: 'transaction',
      contexts: {
        trace: {
          op: 'navigation',
          origin: 'auto.navigation.sveltekit',
          trace_id: expect.stringMatching(/[a-f0-9]{32}/),
        },
      },
    });

    // traces should NOT be connected
    expect(navigationTxn1Event.contexts?.trace?.trace_id).not.toBe(navigationTxn2Event.contexts?.trace?.trace_id);
    expect(navigationTxn2Event.contexts?.trace?.trace_id).not.toBe(navigationTxn3Event.contexts?.trace?.trace_id);
    expect(navigationTxn1Event.contexts?.trace?.trace_id).not.toBe(navigationTxn3Event.contexts?.trace?.trace_id);
  });
});
