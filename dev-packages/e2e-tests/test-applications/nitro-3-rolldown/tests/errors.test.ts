import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('Sends an error event from the runtime plugin', async ({ request }) => {
  const errorEventPromise = waitForError('nitro-3-rolldown', event => {
    return !!event.exception?.values?.some(
      v => v.value === 'This is a test error' && v.mechanism?.type === 'auto.function.nitro.captureErrorHook',
    );
  });

  await request.get('/api/test-error').catch(() => {
    // noop - route throws, request may be reset before a response is sent
  });

  const errorEvent = await errorEventPromise;

  expect(errorEvent.exception?.values).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: 'HTTPError',
        value: 'This is a test error',
        mechanism: expect.objectContaining({ handled: false, type: 'auto.function.nitro.captureErrorHook' }),
      }),
    ]),
  );
});
