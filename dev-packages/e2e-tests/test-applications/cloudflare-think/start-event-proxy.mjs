import { startEventProxyServer } from '@sentry-internal/test-utils';

startEventProxyServer({
  port: 3031,
  proxyServerName: 'cloudflare-think',
  envelopeDumpPath: process.env.SENTRY_ENVELOPE_DUMP_PATH,
});
