import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('Catches errors caught by error boundary', async ({ page }) => {
  page.on('console', message => {
    expect(message.text()).toContain('caught error');
  });

  const errorEventPromise = waitForError('react-19', event => {
    return !event.type && event.exception?.values?.[0]?.value === 'caught error';
  });

  await page.goto('/');

  const exceptionButton = page.locator('id=caughtError-button');
  await exceptionButton.click();

  const errorEvent = await errorEventPromise;

  expect(errorEvent.exception?.values).toHaveLength(2);
  expect(errorEvent.exception?.values?.[0]?.value).toBe('caught error');
});

test('Catches errors uncaught by error boundary', async ({ page }) => {
  page.on('console', message => {
    expect(message.text()).toContain('uncaught error');
  });

  const errorEventPromise = waitForError('react-19', event => {
    return !event.type && event.exception?.values?.[0]?.value === 'uncaught error';
  });

  await page.goto('/');

  const exceptionButton = page.locator('id=uncaughtError-button');
  await exceptionButton.click();

  const errorEvent = await errorEventPromise;

  expect(errorEvent.exception?.values).toHaveLength(2);
  expect(errorEvent.exception?.values?.[0]?.value).toBe('uncaught error');
});
