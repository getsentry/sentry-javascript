import { getPlaywrightConfig } from '@sentry-internal/test-utils';

// The DB driver tests only run in the default (proxy) variant, so the tunnel-route variants don't
// need MySQL/Redis — skip Docker there instead of booting the containers once per variant.
const usesManagedTunnelRoute =
  (process.env.E2E_TEST_TUNNEL_ROUTE_MODE ?? 'off') !== 'off' || process.env.E2E_TEST_CUSTOM_TUNNEL_ROUTE === '1';

// The dev server has no build output, so `--import` points at the app's own instrumentation file.
// `vite dev` ignores PORT, so the port goes on the command.
const startCommand =
  process.env.TEST_ENV === 'development'
    ? `NODE_OPTIONS='--import ./instrument.server.mjs' pnpm dev --port 3000`
    : `pnpm start`;

const config = getPlaywrightConfig({
  startCommand,
  port: 3000,
});

export default usesManagedTunnelRoute
  ? config
  : {
      ...config,
      globalSetup: './global-setup.mjs',
      globalTeardown: './global-teardown.mjs',
    };
