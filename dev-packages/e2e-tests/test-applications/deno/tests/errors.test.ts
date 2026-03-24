import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('Sends error event', async ({ baseURL }) => {
  const errorEventPromise = waitForError('deno', event => {
    return !event.type && event.exception?.values?.[0]?.value === 'This is an error';
  });

  await fetch(`${baseURL}/test-error`);

  const errorEvent = await errorEventPromise;

  expect(errorEvent.exception?.values).toHaveLength(1);
  expect(errorEvent.exception?.values?.[0]?.value).toBe('This is an error');
});
