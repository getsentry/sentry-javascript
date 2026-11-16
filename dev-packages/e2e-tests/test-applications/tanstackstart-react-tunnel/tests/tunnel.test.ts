import { runManagedTunnelSuite } from '@sentry-internal/test-utils/tunnel-suite';

runManagedTunnelSuite({
  appName: 'tanstackstart-react-tunnel',
  basePath: '/app',
  tunnelPath: process.env.E2E_TEST_TUNNEL_ROUTE,
});
