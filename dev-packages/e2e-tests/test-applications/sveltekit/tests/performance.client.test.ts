import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';
import { waitForInitialPageload } from '../utils.js';

test('records manually added component tracking spans', async ({ page }) => {
  const componentTxnEventPromise = waitForTransaction('sveltekit', txnEvent => {
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
      expect.objectContaining({
        data: { 'sentry.op': 'ui.svelte.update', 'sentry.origin': 'auto.ui.svelte' },
        description: '<components/+page>',
        op: 'ui.svelte.update',
        origin: 'auto.ui.svelte',
      }),
      expect.objectContaining({
        data: { 'sentry.op': 'ui.svelte.update', 'sentry.origin': 'auto.ui.svelte' },
        description: '<Component1>',
        op: 'ui.svelte.update',
        origin: 'auto.ui.svelte',
      }),
      expect.objectContaining({
        data: { 'sentry.op': 'ui.svelte.update', 'sentry.origin': 'auto.ui.svelte' },
        description: '<Component2>',
        op: 'ui.svelte.update',
        origin: 'auto.ui.svelte',
      }),
      expect.objectContaining({
        data: { 'sentry.op': 'ui.svelte.update', 'sentry.origin': 'auto.ui.svelte' },
        description: '<Component3>',
        op: 'ui.svelte.update',
        origin: 'auto.ui.svelte',
      }),
    ]),
  );
});
