import { getPlaywrightConfig } from '@sentry-internal/test-utils';

// The dev server has no build output, so `--import` points at the app's own instrumentation file.
// `vite dev` ignores PORT, so the port goes on the command.
const startCommand =
  process.env.TEST_ENV === 'development'
    ? `NODE_OPTIONS='--import ./instrument.server.mjs' pnpm dev --port 3000`
    : `pnpm start`;

export default getPlaywrightConfig(
  { startCommand, port: 3000 },
  { globalSetup: './global-setup.mjs', globalTeardown: './global-teardown.mjs' },
);
