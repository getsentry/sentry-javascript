const { startEventProxyServer } = require('@sentry-internal/event-proxy-server');

startEventProxyServer({
  port: 3031,
  proxyServerName: 'svelte-5',
});
