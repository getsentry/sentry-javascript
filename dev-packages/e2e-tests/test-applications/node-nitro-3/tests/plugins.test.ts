import { spawn } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

const ERROR_MESSAGE = 'Error while a Nitro plugin initializes';

// Nitro passes an error thrown while a plugin initializes to the `error` hook and then rethrows it, so the server does
// not start. The error is captured only if Sentry's plugin ran before this plugin and registered the hook.
test('captures an error thrown while an app plugin initializes', async () => {
  test.skip(process.env.TEST_ENV === 'development', 'Starts the production build');

  const errorPromise = waitForError('node-nitro-3', event => event.exception?.values?.[0]?.value === ERROR_MESSAGE);

  const server = spawn('node', ['.output/server/index.mjs'], {
    env: { ...process.env, PORT: '3032', E2E_PLUGIN_INIT_ERROR: '1' },
    stdio: 'ignore',
  });
  const exitCode = await new Promise(resolve => server.on('exit', resolve));
  const error = await errorPromise;

  expect(exitCode).not.toBe(0);
  expect(error.exception?.values?.[0]?.mechanism).toEqual({
    handled: false,
    type: 'auto.function.nitro.captureErrorHook',
  });
  expect(error.contexts?.nitro).toEqual({ tags: ['plugin'] });
});
