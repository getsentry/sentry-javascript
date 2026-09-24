import { startEventProxyServer } from '@sentry-internal/test-utils';

startEventProxyServer({
  port: 3061,
  proxyServerName: 'remix-v3',
});
