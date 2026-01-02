import { startEventProxyServer } from '@sentry-internal/test-utils';

// Start the main event proxy server that captures events via tunnel
startEventProxyServer({
  port: 3031,
  proxyServerName: 'browser-spotlight',
});
