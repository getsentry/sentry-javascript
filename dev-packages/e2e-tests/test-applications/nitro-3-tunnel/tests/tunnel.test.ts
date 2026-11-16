import { runManagedTunnelSuite } from '@sentry-internal/test-utils/tunnel-suite';

runManagedTunnelSuite({ appName: 'nitro-3-tunnel', basePath: '/app' });
