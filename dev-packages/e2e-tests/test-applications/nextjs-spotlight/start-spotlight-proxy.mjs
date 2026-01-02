import { startSpotlightProxyServer } from '@sentry-internal/test-utils';

console.log('[Spotlight Proxy] Starting spotlight proxy server on port 3032...');

startSpotlightProxyServer({
  port: 3032,
  proxyServerName: 'nextjs-spotlight-sidecar',
});

console.log('[Spotlight Proxy] Server started successfully on port 3032');
