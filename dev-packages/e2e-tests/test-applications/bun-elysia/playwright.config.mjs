import { getPlaywrightConfig } from '@sentry-internal/test-utils';

const isNode = process.env.USE_NODE === 'true';

const config = getPlaywrightConfig({
  startCommand: isNode ? 'node src/app.ts' : 'bun src/app.ts',
});

export default config;
