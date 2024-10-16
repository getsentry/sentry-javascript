import * as path from 'path';
import { startEventProxyServer } from '@sentry-internal/test-utils';

startEventProxyServer({
  port: 3031,
  proxyServerName: 'nextjs-15',
  envelopeDumpPath: path.join(process.cwd(), `events-${Date.now()}.json`),
});
