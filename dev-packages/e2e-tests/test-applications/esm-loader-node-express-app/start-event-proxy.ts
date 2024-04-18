import { startEventProxyServer } from '@sentry-internal/event-proxy-server';

startEventProxyServer({
  port: 3031,
  proxyServerName: 'esm-loader-node-express-app',
});
