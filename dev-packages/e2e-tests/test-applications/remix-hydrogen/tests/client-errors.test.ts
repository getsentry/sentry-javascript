import { expect, test } from '@playwright/test';
import { getSpanOp, waitForError, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('Sends a client-side exception to Sentry', async ({ page }) => {
  // The pageload span only completes once the client SDK and Remix have hydrated.
  // Awaiting it before clicking guarantees the button's onClick handler is attached — a click
  // that lands before hydration would do nothing, and the exception would never be captured.
  const pageloadSpanPromise = waitForStreamedSpan('remix-hydrogen', span => {
    return getSpanOp(span) === 'pageload' && span.is_segment && span.name === '/';
  });

  const errorPromise = waitForError('remix-hydrogen', errorEvent => {
    return errorEvent.exception?.values?.[0].value === 'I am an error!';
  });

  await page.goto('/');

  await pageloadSpanPromise;

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
