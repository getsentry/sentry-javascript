import { expect, test } from '@playwright/test';
import { waitForError, waitForSpotlightError, waitForSpotlightTransaction } from '@sentry-internal/test-utils';

/**
 * Test that Spotlight integration correctly sends events to the sidecar.
 *
 * This test verifies that:
 * 1. The VITE_SENTRY_SPOTLIGHT env var is correctly parsed by Vite
 * 2. The spotlightBrowserIntegration correctly sends events to the sidecar URL
 * 3. Events are sent to both the tunnel AND the Spotlight sidecar URL
 *
 * Note: The automatic Spotlight enablement via env var only works with SDK dev builds
 * (spotlight code is stripped from prod builds). For E2E testing, we explicitly add
 * the integration with the URL from the env var to test the integration functionality.
 *
 * Test setup:
 * - VITE_SENTRY_SPOTLIGHT is set to 'http://localhost:3032/stream' at build time
 * - tunnel is set to 'http://localhost:3031' for regular event capture
 * - A Spotlight proxy server runs on port 3032 to capture Spotlight events
 * - A regular event proxy server runs on port 3031 to capture tunnel events
 */
test('Spotlight integration sends error events to sidecar', async ({ page }) => {
  // Capture console logs for debugging
  page.on('console', msg => {
    console.log(`[Browser Console] ${msg.type()}: ${msg.text()}`);
  });

  // Wait for the error to arrive at the regular tunnel (port 3031)
  const tunnelErrorPromise = waitForError('browser-spotlight', event => {
    return !event.type && event.exception?.values?.[0]?.value === 'Spotlight test error!';
  });

  // Wait for the error event to arrive at the Spotlight sidecar (port 3032)
  const spotlightErrorPromise = waitForSpotlightError('browser-spotlight-sidecar', event => {
    return !event.type && event.exception?.values?.[0]?.value === 'Spotlight test error!';
  });

  await page.goto('/');

  const exceptionButton = page.locator('id=exception-button');
  await exceptionButton.click();

  // Both promises should resolve - the error should be sent to BOTH destinations
  const [tunnelError, spotlightError] = await Promise.all([tunnelErrorPromise, spotlightErrorPromise]);

  // Verify the Spotlight sidecar received the error
  expect(spotlightError.exception?.values).toHaveLength(1);
  expect(spotlightError.exception?.values?.[0]?.value).toBe('Spotlight test error!');
  expect(spotlightError.exception?.values?.[0]?.type).toBe('Error');

  // Verify the tunnel also received the error (normal Sentry flow still works)
  expect(tunnelError.exception?.values).toHaveLength(1);
  expect(tunnelError.exception?.values?.[0]?.value).toBe('Spotlight test error!');

  // Both events should have the same trace context
  expect(spotlightError.contexts?.trace?.trace_id).toBe(tunnelError.contexts?.trace?.trace_id);
});

/**
 * Test that Spotlight receives transaction events as well.
 */
test('Spotlight integration sends transactions to sidecar', async ({ page }) => {
  // Capture console logs for debugging
  page.on('console', msg => {
    console.log(`[Browser Console] ${msg.type()}: ${msg.text()}`);
  });

  // Wait for a pageload transaction to arrive at the Spotlight sidecar
  const spotlightTransactionPromise = waitForSpotlightTransaction('browser-spotlight-sidecar', event => {
    return event.type === 'transaction' && event.contexts?.trace?.op === 'pageload';
  });

  await page.goto('/');

  const spotlightTransaction = await spotlightTransactionPromise;

  // Verify the Spotlight sidecar received the transaction
  expect(spotlightTransaction.type).toBe('transaction');
  expect(spotlightTransaction.contexts?.trace?.op).toBe('pageload');
  expect(spotlightTransaction.transaction).toBe('/');
});
