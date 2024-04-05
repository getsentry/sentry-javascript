import { startEventProxyServer } from '@sentry-internal/event-proxy-server';
startEventProxyServer({
  port: 3031,
  proxyServerName: 'create-remix-app',
});
