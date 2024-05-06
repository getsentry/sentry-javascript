import { cleanupChildProcesses, createRunner } from '../../../utils/runner';

afterAll(() => {
  cleanupChildProcesses();
});

const esmWarning =
  '[Sentry] You are using the Sentry SDK with an ESM build. This version of the SDK is not compatible with ESM. Please either build your application with CommonJS, or use v7 of the SDK.';

test('warns if using ESM', async () => {
  const runner = createRunner(__dirname, 'server.mjs').ignore('session', 'sessions', 'event').start();

  await runner.makeRequest('get', '/test/success');

  expect(runner.getLogs()).toContain(esmWarning);
});

test('does not warn if using CJS', async () => {
  const runner = createRunner(__dirname, 'server.js').ignore('session', 'sessions', 'event').start();

  await runner.makeRequest('get', '/test/success');

  expect(runner.getLogs()).not.toContain(esmWarning);
});
