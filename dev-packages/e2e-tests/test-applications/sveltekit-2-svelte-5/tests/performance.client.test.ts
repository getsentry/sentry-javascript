import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';
import { waitForInitialPageload } from './utils';

test.describe('client-specific performance events', () => {
  test('multiple navigations have distinct traces', async ({ page }) => {
    const navigationTxn1EventPromise = waitForTransaction('sveltekit-2-svelte-5', txnEvent => {
      return txnEvent?.transaction === '/nav1' && txnEvent.contexts?.trace?.op === 'navigation';
    });

    const navigationTxn2EventPromise = waitForTransaction('sveltekit-2-svelte-5', txnEvent => {
      return txnEvent?.transaction === '/' && txnEvent.contexts?.trace?.op === 'navigation';
    });

    const navigationTxn3EventPromise = waitForTransaction('sveltekit-2-svelte-5', txnEvent => {
      return txnEvent?.transaction === '/nav2' && txnEvent.contexts?.trace?.op === 'navigation';
    });

    await waitForInitialPageload(page);

    await page.getByText('Nav 1').click();
    const navigationTxn1Event = await navigationTxn1EventPromise;

    await page.goBack();
    const navigationTxn2Event = await navigationTxn2EventPromise;

    await page.getByText('Nav 2').click();
    const navigationTxn3Event = await navigationTxn3EventPromise;

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

  test('records manually added component tracking spans', async ({ page }) => {
    const componentTxnEventPromise = waitForTransaction('sveltekit-2-svelte-5', txnEvent => {
      return txnEvent?.transaction === '/components';
    });

    await waitForInitialPageload(page);

    await page.getByText('Component Tracking').click();

    const componentTxnEvent = await componentTxnEventPromise;

    expect(componentTxnEvent.spans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          data: { 'sentry.op': 'ui.svelte.init', 'sentry.origin': 'auto.ui.svelte' },
          description: '<components/+page>',
          op: 'ui.svelte.init',
          origin: 'auto.ui.svelte',
        }),
        expect.objectContaining({
          data: { 'sentry.op': 'ui.svelte.init', 'sentry.origin': 'auto.ui.svelte' },
          description: '<Component1>',
          op: 'ui.svelte.init',
          origin: 'auto.ui.svelte',
        }),
        expect.objectContaining({
          data: { 'sentry.op': 'ui.svelte.init', 'sentry.origin': 'auto.ui.svelte' },
          description: '<Component2>',
          op: 'ui.svelte.init',
          origin: 'auto.ui.svelte',
        }),
        expect.objectContaining({
          data: { 'sentry.op': 'ui.svelte.init', 'sentry.origin': 'auto.ui.svelte' },
          description: '<Component3>',
          op: 'ui.svelte.init',
          origin: 'auto.ui.svelte',
        }),
      ]),
    );
  });
});
