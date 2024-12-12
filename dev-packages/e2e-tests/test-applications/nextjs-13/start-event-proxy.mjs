import * as fs from 'fs';
import * as path from 'path';
import { startEventProxyServer } from '@sentry-internal/test-utils';

const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json')));

startEventProxyServer({
  port: 3031,
  proxyServerName: 'nextjs-13',
  envelopeDumpPath: path.join(
    process.cwd(),
    `event-dumps/next-13-v${packageJson.dependencies.next}-${process.env.TEST_ENV}.dump`,
  ),
});
