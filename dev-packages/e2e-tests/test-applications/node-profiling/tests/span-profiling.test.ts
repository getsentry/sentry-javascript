import { expect, test } from '@playwright/test';
import { waitForProfile } from '@sentry-internal/test-utils';

test('Sends correct error event', async ({ baseURL }) => {
  const errorEventPromise = waitForProfile('node-express', event => {
    return event
  });

  await fetch(`${baseURL}/test`);
  const errorEvent = await errorEventPromise;

  console.log(errorEvent);
  expect(errorEvent).not.toBe(null);
});
