import { expect, test } from '@playwright/test';
import { waitForError, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('Should handle server action redirect without capturing errors', async ({ page, request }) => {
  // Wait for the initial pageload span
  const pageLoadSpanPromise = waitForStreamedSpan('nextjs-16', span => {
    return span.name === '/redirect/origin' && span.is_segment;
  });

  // Navigate to the origin page
  await page.goto('/redirect/origin');

  const pageLoadSpan = await pageLoadSpanPromise;
  expect(pageLoadSpan).toBeDefined();

  // Wait for the redirect span
  const redirectSpanPromise = waitForStreamedSpan('nextjs-16', span => {
    return span.name === 'GET /redirect/destination' && span.is_segment;
  });

  // The error of `/api/test-error`, requested after the redirect, is the sentinel: an error of the redirect would
  // arrive before it.
  const firstErrorPromise = waitForError('nextjs-16', () => true);

  // Click the redirect button
  await page.click('button[type="submit"]');

  await redirectSpanPromise;

  // Verify we got redirected to the destination page
  await expect(page).toHaveURL('/redirect/destination');

  await request.get('/api/test-error');

  const firstError = await firstErrorPromise;
  expect(firstError.exception?.values?.[0]?.value).toBe('This is a test error from an API route');
});
