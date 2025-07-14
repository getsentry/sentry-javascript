import * as Sentry from '@sentry/node';
import { eventLoopBlockIntegration } from '@sentry/node-native';
import * as path from 'path';
import * as url from 'url';
import { longWork } from './long-work.js';

global._sentryDebugIds = { [new Error().stack]: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaa' };

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

setTimeout(() => {
  process.exit();
}, 10000);

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  release: '1.0',
  integrations: [eventLoopBlockIntegration({ appRootPath: __dirname })],
});

setTimeout(() => {
  longWork();
}, 1000);
