import { startEventProxyServer } from '@sentry-internal/event-proxy-server';

startEventProxyServer({
  port: 3031,
  proxyServerName: 'react-router-5',
});
