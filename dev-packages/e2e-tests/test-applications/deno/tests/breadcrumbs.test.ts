import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('Sends error event with breadcrumbs', async ({ baseURL }) => {
  const errorEventPromise = waitForError('deno', event => {
    return !event.type && event.exception?.values?.[0]?.value === 'breadcrumb-test';
  });

  await fetch(`${baseURL}/test-breadcrumb`);

  const errorEvent = await errorEventPromise;

  expect(errorEvent.exception?.values).toHaveLength(1);
  expect(errorEvent.exception?.values?.[0]?.value).toBe('breadcrumb-test');

  expect(errorEvent.breadcrumbs).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        message: 'test-breadcrumb',
        category: 'custom',
        level: 'info',
      }),
    ]),
  );
});
