import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('Sends an error thrown in a task to Sentry', async ({ request }) => {
  const errorEventPromise = waitForError('nitro-3', event => {
    return !!event.exception?.values?.some(v => v.value === 'This is a task error');
  });

  await request.get('/api/test-task-error');

  const errorEvent = await errorEventPromise;

  expect(errorEvent.exception?.values).toEqual([
    expect.objectContaining({
      type: 'Error',
      value: 'This is a task error',
      mechanism: expect.objectContaining({
        handled: false,
        type: 'auto.function.nitro.task',
      }),
    }),
  ]);
  expect(errorEvent.contexts?.nitro).toEqual({ task: 'test-error' });
});
