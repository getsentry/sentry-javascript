import { getPlaywrightConfig } from '@sentry-internal/test-utils';

// Fix urls not resolving to localhost on Node v17+
// See: https://github.com/axios/axios/issues/3821#issuecomment-1413727575
import { setDefaultResultOrder } from 'dns';
setDefaultResultOrder('ipv4first');

const eventProxyPort = 3031;

/**
 * See https://playwright.dev/docs/test-configuration.
 */
const config = getPlaywrightConfig(
  { startCommand: '' },
  {
    /* Run your local dev server before starting the tests */
    webServer: [
      {
        command: `node start-event-proxy.mjs && pnpm wait-port ${eventProxyPort}`,
        port: eventProxyPort,
        stdout: 'pipe',
      },
    ],
  },
);

export default config;
