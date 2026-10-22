import { getPlaywrightConfig } from '@sentry-internal/test-utils';

const config = getPlaywrightConfig(
  {
    startCommand: `pnpm start`,
  },
  {
    webServer: [
      {
        command: `node ./start-event-proxy.mjs`,
        port: 3031,
        stdout: 'pipe',
        stderr: 'pipe',
      },
      {
        command: `node ./start-otel-proxy.mjs`,
        port: 3032,
        stdout: 'pipe',
        stderr: 'pipe',
      },
      {
        command: 'pnpm start',
        port: 3030,
        stdout: 'pipe',
        stderr: 'pipe',
        env: {
          PORT: 3030,
        },
      },
    ],
  },
);

export default config;
