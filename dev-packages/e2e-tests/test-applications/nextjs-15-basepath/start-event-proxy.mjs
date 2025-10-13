import * as fs from 'fs';
import * as path from 'path';
import { startEventProxyServer } from '@sentry-internal/test-utils';

const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json')));

startEventProxyServer({
  port: 3031,
  proxyServerName: 'nextjs-15-basepath',
  envelopeDumpPath: path.join(
    process.cwd(),
    `event-dumps/next-15-basepath-v${packageJson.dependencies.next}-${process.env.TEST_ENV}.dump`,
  ),
});
