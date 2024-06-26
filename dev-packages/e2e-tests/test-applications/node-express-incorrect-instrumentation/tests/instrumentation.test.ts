import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('Sends correct context when instrumentation was set up incorrectly', async ({ baseURL }) => {
  const errorEventPromise = waitForError('node-express', event => {
    return !event.type && event.exception?.values?.[0]?.value === 'This is an exception with id 123';
  });

  await fetch(`${baseURL}/test-exception/123`);

  const errorEvent = await errorEventPromise;

  expect(errorEvent.exception?.values).toHaveLength(1);
  expect(errorEvent.exception?.values?.[0]?.value).toBe('This is an exception with id 123');

  expect(errorEvent.contexts?.missing_instrumentation).toEqual({
    package: 'express',
    'javascript.is_cjs': true,
  });
});
