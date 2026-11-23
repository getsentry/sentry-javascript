import { expect, test } from '@playwright/test';
import { SDK_VERSION } from '@sentry/core';
import { waitForError } from '@sentry-internal/test-utils';
import { APP_NAME, RUNTIME } from './constants';

test('sends the Hono SDK info and does not install the default Hono integration', async ({ baseURL }) => {
  const errorPromise = waitForError(
    APP_NAME,
    event => event.exception?.values?.[0]?.value === 'Error for the SDK test',
  );

  await fetch(`${baseURL}/sdk-error`);

  const errorEvent = await errorPromise;

  expect(errorEvent.sdk).toMatchObject({
    name: 'sentry.javascript.hono',
    version: SDK_VERSION,
    packages: [
      { name: 'npm:@sentry/hono', version: SDK_VERSION },
      { name: `npm:@sentry/${RUNTIME}`, version: SDK_VERSION },
    ],
  });
  // The runtime SDKs install Hono by default. The `sentry()` middleware instruments Hono instead.
  expect(errorEvent.sdk?.integrations).not.toContain('Hono');
});
