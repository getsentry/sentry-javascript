const { startEventProxyServer } = require('@sentry-internal/event-proxy-server');

startEventProxyServer({
  port: 27496,
  proxyServerName: 'nextjs-13-app-dir',
});
