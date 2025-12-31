import { getPlaywrightConfig } from '@sentry-internal/test-utils';

const config = getPlaywrightConfig({
  startCommand: `pnpm preview`,
});

// Add the Spotlight proxy server as an additional webServer
// This runs alongside the main event proxy and app server
config.webServer.push({
  command: 'node start-spotlight-proxy.mjs',
  port: 3032,
  stdout: 'pipe',
  stderr: 'pipe',
});

export default config;
