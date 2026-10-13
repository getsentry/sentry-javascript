import { getPlaywrightConfig } from '@sentry-internal/test-utils';
import { fileURLToPath } from 'url';

// Run the same tests against both the production server (`react-router-serve`) and the dev server
// (`react-router dev`), selected via TEST_ENV. This ensures server build capture (used for middleware
// name resolution) works in both modes. `react-router dev` runs the Vite dev server, which ignores
// PORT, so the port is passed on the command instead.
const startCommand = process.env.TEST_ENV === 'development' ? `pnpm dev --port 3030` : `PORT=3030 pnpm start`;

const config = getPlaywrightConfig(
  {
    startCommand,
    port: 3030,
  },
  // Boot Redis before the tests run, outside the webServer startup-timeout window.
  { globalSetup: fileURLToPath(new URL('./global-setup.mjs', import.meta.url)) },
);

export default config;
