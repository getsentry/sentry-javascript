import { getPlaywrightConfig, getRuntime } from '@sentry-internal/test-utils';

// The server build sets up the SDK on every runtime, so no start command needs a preload.
const startCommands = {
  node: 'pnpm start',
  bun: 'pnpm start:bun',
  deno: 'pnpm start:deno',
  cloudflare: 'pnpm start:cloudflare',
};

// The dev server has no build output, so `--import` points at the app's own instrumentation file.
// `vite dev` ignores PORT, so the port goes on the command.
const startCommand =
  process.env.TEST_ENV === 'development'
    ? `NODE_OPTIONS='--import ./instrument.server.mjs' pnpm dev --port 3000`
    : startCommands[getRuntime()];

export default getPlaywrightConfig(
  { startCommand, port: 3000 },
  { globalSetup: './global-setup.mjs', globalTeardown: './global-teardown.mjs' },
);
