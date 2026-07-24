import { getPlaywrightConfig } from '@sentry-internal/test-utils';

// This app runs the React Router dev server (`react-router dev`) instead of a production build, so
// we can verify that server build capture (used for middleware name resolution) works in dev mode.
const config = getPlaywrightConfig({
  // `react-router dev` runs the Vite dev server, which ignores PORT - pass the port to the script.
  startCommand: `pnpm dev`,
  port: 3030,
});

export default config;
