import { expect, test } from '@playwright/test';
import { waitForError, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('Should handle server action redirect without capturing errors', async ({ page }) => {
  // Wait for the initial pageload span
  const pageLoadSpanPromise = waitForStreamedSpan('nextjs-15', span => {
    return span.name === '/redirect/origin' && span.is_segment;
  });

  // Navigate to the origin page
  await page.goto('/redirect/origin');

  const pageLoadSpan = await pageLoadSpanPromise;
  expect(pageLoadSpan).toBeDefined();

  // Wait for the redirect span
  const redirectSpanPromise = waitForStreamedSpan('nextjs-15', span => {
    return span.name === 'GET /redirect/destination' && span.is_segment;
  });

  // No error should be captured
  const redirectErrorPromise = waitForError('nextjs-15', async errorEvent => {
    return !!errorEvent;
  });

  // Click the redirect button
  await page.click('button[type="submit"]');

  await redirectSpanPromise;

  // Verify we got redirected to the destination page
  await expect(page).toHaveURL('/redirect/destination');

  // Wait for potential errors with a 2 second timeout
  const errorTimeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('No error captured (timeout)')), 2000),
  );

  // We expect this to timeout since no error should be captured during the redirect
  try {
    await Promise.race([redirectErrorPromise, errorTimeout]);
    throw new Error('Expected no error to be captured, but an error was found');
  } catch (e) {
    // If we get a timeout error (as expected), no error was captured
    expect((e as Error).message).toBe('No error captured (timeout)');
  }
});
