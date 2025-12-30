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
  expect(errorEvent.exception?.values?.[0]?.mechanism).toEqual({
    type: 'auto.function.react.error_handler',
    handled: true, // true because a callback was provided
    exception_id: 1,
    parent_id: 0,
    source: 'cause',
  });

  expect(errorEvent.exception?.values?.[1]?.value).toBe('caught error');
  expect(errorEvent.exception?.values?.[1]?.mechanism).toEqual({
    type: 'generic',
    handled: true, // true because a callback was provided
    exception_id: 0,
  });
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
  expect(errorEvent.exception?.values?.[0]?.mechanism).toEqual({
    type: 'auto.function.react.error_handler',
    handled: true, // true because a callback was provided
    exception_id: 1,
    parent_id: 0,
    source: 'cause',
  });

  expect(errorEvent.exception?.values?.[1]?.value).toBe('uncaught error');
  expect(errorEvent.exception?.values?.[1]?.mechanism).toEqual({
    type: 'generic',
    handled: true, // true because a callback was provided
    exception_id: 0,
  });
});
