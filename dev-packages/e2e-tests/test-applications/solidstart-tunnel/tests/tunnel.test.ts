import { runManagedTunnelSuite } from '@sentry-internal/test-utils/tunnel-suite';

runManagedTunnelSuite({ appName: 'solidstart-tunnel', basePath: '/app' });
