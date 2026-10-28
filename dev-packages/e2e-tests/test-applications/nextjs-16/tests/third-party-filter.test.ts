import test, { expect } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';
import { isVinext } from './isVinext';

const isWebpackDev = process.env.TEST_ENV === 'development-webpack';

test('First-party error with React frames should not be tagged as third-party code', async ({ page }) => {
  test.skip(isVinext, 'vinext runs no Sentry build plugin, so the filter has no module metadata of first-party frames');
  test.skip(isWebpackDev, 'Only relevant for Turbopack builds');

  const errorPromise = waitForError('nextjs-16', errorEvent => {
    return errorEvent?.exception?.values?.some(value => value.value === 'first-party-error') ?? false;
  });

  await page.goto('/third-party-filter');
  await page.waitForFunction(() => '__SENTRY__' in window);
  await page.locator('#first-party-error-btn').click();

  const errorEvent = await errorPromise;

  expect(errorEvent.exception?.values?.[0]?.value).toBe('first-party-error');

  // In production, TEST_ENV=production is shared by both turbopack and webpack variants.
  // Only assert when the build is actually turbopack.
  if (errorEvent.tags?.turbopack) {
    // By default, the integration uses `apply-tag-if-contains-third-party-frames` which tags errors
    // if ANY frame is third-party. This error is thrown inside a React onClick handler,
    // so the stack trace contains React frames from node_modules. These must NOT be
    // treated as third-party — the module metadata injection must cover node_modules too
    // (matching the webpack plugin's behavior).
    expect(errorEvent.tags?.third_party_code).toBeUndefined();
  }
});

test('retains application errors with dependency frames when dependency metadata is excluded', async ({ page }) => {
  test.skip(process.env.NEXT_PUBLIC_EXCLUDE_APPLICATION_KEY_DEPENDENCIES !== '1');

  const errorPromise = waitForError('nextjs-16', event => {
    return event.exception?.values?.some(value => value.value === 'application-key-dependency-error') ?? false;
  });

  await page.goto('/third-party-filter');
  await page.waitForFunction(() => '__SENTRY__' in window);
  await page.locator('#dependency-error-btn').click();

  const event = await errorPromise;
  const exception = event.exception?.values?.[0];
  expect(exception?.value).toBe('application-key-dependency-error');
  expect(exception?.mechanism).toEqual({ handled: true, type: 'generic' });
  expect(event.tags?.third_party_code).toBeUndefined();
  expect(event.tags?.turbopack).toBe(true);
  expect(new Set(exception?.stacktrace?.frames?.map(frame => frame.filename)).size).toBeGreaterThan(1);
});
