import test, { expect } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

const isWebpackDev = process.env.TEST_ENV === 'development-webpack';

test('First-party error should not be tagged as third-party code', async ({ page }) => {
  test.skip(isWebpackDev, 'Only relevant for Turbopack builds');

  const errorPromise = waitForError('nextjs-16', errorEvent => {
    return errorEvent?.exception?.values?.some(value => value.value === 'first-party-error') ?? false;
  });

  await page.goto('/third-party-filter');
  await page.locator('#first-party-error-btn').click();

  const errorEvent = await errorPromise;

  expect(errorEvent.exception?.values?.[0]?.value).toBe('first-party-error');

  // In production, TEST_ENV=production is shared by both turbopack and webpack variants.
  // Only assert when the build is actually turbopack.
  if (errorEvent.tags?.turbopack) {
    expect(errorEvent.tags?.third_party_code).toBeUndefined();
  }
});
