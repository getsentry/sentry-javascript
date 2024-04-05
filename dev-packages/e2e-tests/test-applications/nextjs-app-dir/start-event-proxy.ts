import { startEventProxyServer } from '@sentry-internal/event-proxy-server';

startEventProxyServer({
  port: 3031,
  proxyServerName: 'nextjs-13-app-dir',
});
