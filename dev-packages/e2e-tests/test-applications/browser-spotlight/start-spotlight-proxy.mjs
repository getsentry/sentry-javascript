import { startSpotlightProxyServer } from '@sentry-internal/test-utils';

// Start a Spotlight proxy server that captures events sent to /stream
// This simulates the Spotlight sidecar and allows us to verify events arrive
startSpotlightProxyServer({
  port: 3032,
  proxyServerName: 'browser-spotlight-sidecar',
});
