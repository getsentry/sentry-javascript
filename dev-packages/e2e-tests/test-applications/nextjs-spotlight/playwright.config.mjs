import { getPlaywrightConfig } from '@sentry-internal/test-utils';

const config = getPlaywrightConfig({
  startCommand: 'pnpm start',
  port: 3030,
});

// Add the Spotlight proxy server as an additional webServer
config.webServer.push({
  command: 'node start-spotlight-proxy.mjs',
  port: 3032,
  stdout: 'pipe',
  stderr: 'pipe',
});

export default config;
