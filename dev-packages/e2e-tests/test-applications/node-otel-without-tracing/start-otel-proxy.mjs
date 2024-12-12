import { startProxyServer } from '@sentry-internal/test-utils';

startProxyServer({
  port: 3032,
  proxyServerName: 'node-otel-without-tracing-otel',
});
