import { getPlaywrightConfig } from '@sentry-internal/test-utils';

const config = getPlaywrightConfig(
  {
    startCommand: 'pnpm preview',
    eventProxyFile: 'start-event-proxy.mjs',
    eventProxyPort: 3031,
    port: 3030,
  },
  {
    // Wait for all three servers to be ready
    webServer: [
      {
        command: 'node start-event-proxy.mjs',
        port: 3031,
        stdout: 'pipe',
        stderr: 'pipe',
      },
      {
        command: 'cd apps/mfe-header && pnpm preview',
        port: 3032,
        stdout: 'pipe',
        stderr: 'pipe',
      },
      {
        command: 'cd apps/mfe-one && pnpm preview',
        port: 3033,
        stdout: 'pipe',
        stderr: 'pipe',
      },
      {
        command: 'cd apps/shell && pnpm preview',
        port: 3030,
        stdout: 'pipe',
        stderr: 'pipe',
      },
    ],
  },
);

export default config;
