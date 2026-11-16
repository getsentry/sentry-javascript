import { runManagedTunnelSuite } from '@sentry-internal/test-utils/tunnel-suite';

runManagedTunnelSuite({ appName: 'solidstart-2-tunnel', basePath: '/app' });
