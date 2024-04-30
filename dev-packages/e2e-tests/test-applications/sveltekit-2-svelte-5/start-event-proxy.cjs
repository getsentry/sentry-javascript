const { startEventProxyServer } = require('@sentry-internal/event-proxy-server');

startEventProxyServer({
  port: 3031,
  proxyServerName: 'sveltekit-2-svelte-5',
});
