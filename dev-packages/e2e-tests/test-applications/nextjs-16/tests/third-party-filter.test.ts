import test, { expect } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('First-party error should not be tagged as third-party code', async ({ page }) => {
  // This test only applies to Turbopack builds where the moduleMetadataInjectionLoader is active.
  // On webpack builds, the @sentry/webpack-plugin handles metadata injection instead.
  // We run the test for all environments since the integration is always configured,
  // but the assertion is meaningful primarily for Turbopack (development mode default).

  const errorPromise = waitForError('nextjs-16', errorEvent => {
    return errorEvent?.exception?.values?.some(value => value.value === 'first-party-error') ?? false;
  });

  await page.goto('/third-party-filter');
  await page.locator('#first-party-error-btn').click();

  const errorEvent = await errorPromise;

  expect(errorEvent.exception?.values?.[0]?.value).toBe('first-party-error');

  // The thirdPartyErrorFilterIntegration is configured with
  // 'apply-tag-if-exclusively-contains-third-party-frames'.
  // Since this error originates entirely from first-party code,
  // it should NOT be tagged as third_party_code.
  expect(errorEvent.tags?.third_party_code).toBeUndefined();
});
