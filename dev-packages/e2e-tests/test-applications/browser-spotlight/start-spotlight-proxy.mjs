import { startSpotlightProxyServer } from '@sentry-internal/test-utils';

console.log('[Spotlight Proxy] Starting spotlight proxy server on port 3032...');

// Start a Spotlight proxy server that captures events sent to /stream
// This simulates the Spotlight sidecar and allows us to verify events arrive
startSpotlightProxyServer({
  port: 3032,
  proxyServerName: 'browser-spotlight-sidecar',
})
  .then(() => {
    console.log('[Spotlight Proxy] Server started successfully on port 3032');
  })
  .catch(err => {
    console.error('[Spotlight Proxy] Failed to start server:', err);
  });
