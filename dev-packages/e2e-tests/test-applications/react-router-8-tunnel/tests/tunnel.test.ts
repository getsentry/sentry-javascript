import { runManagedTunnelSuite } from '@sentry-internal/test-utils/tunnel-suite';

runManagedTunnelSuite({ appName: 'react-router-8-tunnel', basePath: '/app' });
