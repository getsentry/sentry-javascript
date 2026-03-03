import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test.describe('Astro actions', () => {
  test('captures transaction for action call', async ({ page }) => {
    const transactionEventPromise = waitForTransaction('astro-5-cf-workers', transactionEvent => {
      return transactionEvent.transaction === 'GET /action-test';
    });

    await page.goto('/action-test');

    const transactionEvent = await transactionEventPromise;

    expect(transactionEvent).toMatchObject({
      transaction: 'GET /action-test',
    });

    const traceId = transactionEvent.contexts?.trace?.trace_id;
    expect(traceId).toMatch(/[a-f0-9]{32}/);
  });

  test('action submission creates a transaction', async ({ page }) => {
    await page.goto('/action-test');

    const transactionEventPromise = waitForTransaction('astro-5-cf-workers', transactionEvent => {
      return (
        transactionEvent.transaction?.includes('action-test') && transactionEvent.transaction !== 'GET /action-test'
      );
    });

    await page.getByText('Submit Action').click();

    // Wait for the result to appear on the page
    await page.waitForSelector('#result:not(:empty)');

    const resultText = await page.locator('#result').textContent();
    expect(resultText).toContain('success');

    const transactionEvent = await transactionEventPromise;
    expect(transactionEvent).toBeDefined();
    expect(transactionEvent.contexts?.trace?.trace_id).toMatch(/[a-f0-9]{32}/);
  });
});
