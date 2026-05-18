import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('captures a JavaScript error', async ({ page }) => {
  const errorPromise = waitForError('ember-6', event => {
    return event.exception?.values?.[0]?.value?.includes('Generic Javascript Error') ?? false;
  });

  await page.goto('/');
  await page.locator('[data-test-button="Throw Generic Javascript Error"]').click();

  const errorEvent = await errorPromise;

  expect(errorEvent.exception?.values?.[0]?.value).toContain('Generic Javascript Error');
});
