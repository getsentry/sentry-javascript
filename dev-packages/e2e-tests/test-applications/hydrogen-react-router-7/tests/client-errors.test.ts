import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';

test('Sends a client-side exception to Sentry', async ({ page }) => {
  // The pageload transaction only completes once the client SDK and the router have hydrated.
  // Awaiting it before clicking guarantees the button's onClick handler is attached — a click that
  // lands before hydration would do nothing, and the exception would never be captured.
  const pageloadTransactionPromise = waitForTransaction('hydrogen-react-router-7', transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'pageload' && transactionEvent.transaction === '/';
  });

  const errorPromise = waitForError('hydrogen-react-router-7', errorEvent => {
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
  // Wait for hydration (see above) before clicking, so the button's onClick handler is attached.
  const pageloadTransactionPromise = waitForTransaction('hydrogen-react-router-7', transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'pageload' && transactionEvent.transaction === '/client-error';
  });

  const errorPromise = waitForError('hydrogen-react-router-7', errorEvent => {
    return errorEvent.exception?.values?.[0].value === 'Sentry React Component Error';
  });

  await page.goto('/client-error');

  await pageloadTransactionPromise;

  const throwButton = page.locator('id=throw-on-click');
  await throwButton.click();

  const errorEvent = await errorPromise;

  expect(errorEvent).toBeDefined();
});
