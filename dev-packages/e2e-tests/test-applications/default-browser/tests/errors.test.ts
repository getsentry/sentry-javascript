import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('captures an error', async ({ page }) => {
  const errorEventPromise = waitForError('default-browser', event => {
    return !event.type && event.exception?.values?.[0]?.value === 'I am an error!';
  });

  await page.goto('/');

  const exceptionButton = page.locator('id=exception-button');
  await exceptionButton.click();

  const errorEvent = await errorEventPromise;

  expect(errorEvent.exception?.values).toHaveLength(1);
  expect(errorEvent.exception?.values?.[0]?.value).toBe('I am an error!');

  expect(errorEvent.transaction).toBe('/');

  expect(errorEvent.request).toEqual({
    url: 'http://localhost:3030/',
    headers: expect.any(Object),
  });

  expect(errorEvent.contexts?.trace).toEqual({
    trace_id: expect.any(String),
    span_id: expect.any(String),
  });
});
