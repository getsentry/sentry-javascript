import { getPlaywrightConfig } from '@sentry-internal/test-utils';

// `vinxi dev` ignores PORT, so the port goes on the command, and the SDK comes from the app's own
// instrumentation file rather than the build output the production command uses.
const startCommand =
  process.env.TEST_ENV === 'development'
    ? `NODE_OPTIONS='--import ./instrument.server.mjs' pnpm dev --port 3030`
    : 'pnpm start:import';

const config = getPlaywrightConfig({
  startCommand,
  port: 3030,
});

export default {
  ...config,
  globalSetup: './global-setup.mjs',
  globalTeardown: './global-teardown.mjs',
};
