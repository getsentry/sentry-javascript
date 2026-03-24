import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('Sends error event with user, tags, and extras', async ({ baseURL }) => {
  const errorEventPromise = waitForError('deno', event => {
    return !event.type && event.exception?.values?.[0]?.value === 'context-test';
  });

  await fetch(`${baseURL}/test-context`);

  const errorEvent = await errorEventPromise;

  expect(errorEvent.exception?.values).toHaveLength(1);
  expect(errorEvent.exception?.values?.[0]?.value).toBe('context-test');

  expect(errorEvent.user).toEqual(
    expect.objectContaining({
      id: '123',
      email: 'test@sentry.io',
    }),
  );

  expect(errorEvent.tags).toEqual(
    expect.objectContaining({
      'deno-runtime': 'true',
    }),
  );

  expect(errorEvent.extra).toEqual(
    expect.objectContaining({
      detail: { key: 'value' },
    }),
  );
});
