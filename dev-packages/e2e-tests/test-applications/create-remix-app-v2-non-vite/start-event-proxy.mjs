import { startEventProxyServer } from '@sentry-internal/test-utils';

startEventProxyServer({
  port: 3032,
  proxyServerName: 'create-remix-app-v2-non-vite',
});
