import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('Captures exception correctly', async ({ page }) => {
  const errorEventPromise = waitForError('react-create-memory-router', event => {
    return !event.type && event.exception?.values?.[0]?.value === 'I am an error!';
  });

  await page.goto('/');

  // We're on the user page, navigate back to the home page
  const homeButton = page.locator('id=home-button');
  await homeButton.click();

  const exceptionButton = page.locator('id=exception-button');
  await exceptionButton.click();

  const errorEvent = await errorEventPromise;

  expect(errorEvent.exception?.values).toHaveLength(1);
  expect(errorEvent.exception?.values?.[0]?.value).toBe('I am an error!');

  expect(errorEvent.request).toEqual({
    headers: expect.any(Object),
    url: 'http://localhost:3030/',
  });

  expect(errorEvent.transaction).toEqual('/');

  expect(errorEvent.contexts?.trace).toEqual({
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
  });
});
