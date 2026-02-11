import { startProxyServer } from '@sentry-internal/test-utils';

startProxyServer({
  port: 3032,
  proxyServerName: 'node-core-express-otel-v1-sdk-node-otel',
});
