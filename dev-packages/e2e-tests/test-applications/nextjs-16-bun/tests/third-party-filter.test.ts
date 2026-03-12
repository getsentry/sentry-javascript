import test, { expect } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

const isWebpackDev = process.env.TEST_ENV === 'development-webpack';

test('First-party error should not be tagged as third-party with exclusively-contains mode', async ({ page }) => {
  test.skip(isWebpackDev, 'Only relevant for Turbopack builds');

  const errorPromise = waitForError('nextjs-16-bun', errorEvent => {
    return errorEvent?.exception?.values?.some(value => value.value === 'first-party-error') ?? false;
  });

  await page.goto('/third-party-filter');
  await page.locator('#first-party-error-btn').click();

  const errorEvent = await errorPromise;

  expect(errorEvent.exception?.values?.[0]?.value).toBe('first-party-error');

  // In production, TEST_ENV=production is shared by both turbopack and webpack variants.
  // Only assert when the build is actually turbopack.
  if (errorEvent.tags?.turbopack) {
    // The integration uses `apply-tag-if-exclusively-contains-third-party-frames` which
    // only tags errors if ALL frames are third-party. A first-party error with React frames
    // should not be tagged because the first-party frames have metadata.
    expect(errorEvent.tags?.third_party_code).toBeUndefined();
  }
});
