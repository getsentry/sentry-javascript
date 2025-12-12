import { getPlaywrightConfig } from '@sentry-internal/test-utils';

// No webServer needed - Spotlight spawns the app via `spotlight run`
// Tests call startSpotlight() directly in beforeAll hooks
const config = getPlaywrightConfig(
  {},
  {
    // Override webServer to empty - Spotlight handles app startup
    webServer: [],
  },
);

export default config;
