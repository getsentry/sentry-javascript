import { runManagedTunnelSuite } from '@sentry-internal/test-utils/tunnel-suite';

runManagedTunnelSuite({ appName: 'solidstart-1-tunnel', basePath: '/app' });
