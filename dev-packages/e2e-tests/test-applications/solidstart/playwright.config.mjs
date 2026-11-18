import { getPlaywrightConfig } from '@sentry-internal/test-utils';

// The static trace lifecycle variant sets this to `static`.
process.env.E2E_TEST_TRACE_LIFECYCLE ??= 'stream';

// `vinxi dev` ignores PORT, so the port goes on the command, and the SDK comes from the app's own
// instrumentation file rather than the build output the production command uses.
// The inject modes load the SDK from the server entry, so they start without a preload.
function getStartCommand() {
  if (process.env.TEST_ENV === 'development') {
    return `NODE_OPTIONS='--import ./instrument.server.mjs' pnpm dev --port 3030`;
  }
  return process.env.E2E_TEST_INJECT_MODE ? 'pnpm preview' : 'pnpm start:import';
}

const config = getPlaywrightConfig({
  startCommand: getStartCommand(),
  port: 3030,
});

export default {
  ...config,
  globalSetup: './global-setup.mjs',
  globalTeardown: './global-teardown.mjs',
};
