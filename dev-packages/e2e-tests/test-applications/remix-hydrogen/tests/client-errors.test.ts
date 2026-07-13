import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';

test('Sends a client-side exception to Sentry', async ({ page }) => {
  // The pageload transaction only completes once the client SDK and Remix have hydrated.
  // Awaiting it before clicking guarantees the button's onClick handler is attached — a click
  // that lands before hydration would do nothing, and the exception would never be captured.
  const pageloadTransactionPromise = waitForTransaction('remix-hydrogen', transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'pageload' && transactionEvent.transaction === '/';
  });

  const errorPromise = waitForError('remix-hydrogen', errorEvent => {
    return errorEvent.exception?.values?.[0].value === 'I am an error!';
  });

  await page.goto('/');

  await pageloadTransactionPromise;

  const exceptionButton = page.locator('id=exception-button');
  await exceptionButton.click();

  const errorEvent = await errorPromise;

  expect(errorEvent).toBeDefined();
});

test('Sends a client-side ErrorBoundary exception to Sentry', async ({ page }) => {
  const errorPromise = waitForError('remix-hydrogen', errorEvent => {
    return errorEvent.exception?.values?.[0].value === 'Sentry React Component Error';
  });

  await page.goto('/client-error');

  const errorEvent = await errorPromise;

  expect(errorEvent).toBeDefined();
});
