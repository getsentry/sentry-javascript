import { startEventProxyServer } from '@sentry-internal/test-utils';

startEventProxyServer({
  port: 3031,
  proxyServerName: 'angular-18',
});
