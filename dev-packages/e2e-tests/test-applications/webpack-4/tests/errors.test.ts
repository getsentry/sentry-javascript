import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('Captures an exception', async ({ page }) => {
  const eventPromise = waitForError('webpack-4', event => {
    return event.exception?.values?.[0].value === 'I am an error!';
  });
  await page.goto('/');

  const errorEvent = await eventPromise;

  expect(errorEvent.exception?.values?.[0].value).toBe('I am an error!');
  expect(errorEvent.transaction).toBe('/');
});
