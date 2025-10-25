import * as fs from 'fs';
import * as path from 'path';
import { startEventProxyServer } from '@sentry-internal/test-utils';

const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json')));

startEventProxyServer({
  port: 3031,
  proxyServerName: 'nextjs-15-intl',
  envelopeDumpPath: path.join(
    process.cwd(),
    `event-dumps/nextjs-15-intl-v${packageJson.dependencies.next}-${process.env.TEST_ENV}.dump`,
  ),
});
