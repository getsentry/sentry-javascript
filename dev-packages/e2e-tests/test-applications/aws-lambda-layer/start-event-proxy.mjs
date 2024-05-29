import { startEventProxyServer } from '@sentry-internal/event-proxy-server';

console.log('start proxy server');

startEventProxyServer({
  port: 3031,
  proxyServerName: 'aws-serverless-lambda-layer',
  forwardToSentry: false,
});
