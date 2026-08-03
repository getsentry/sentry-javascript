import { getPlaywrightConfig } from '@sentry-internal/test-utils';

// `vite build` runs the Sentry auto-instrument transform over the worker entry;
// `pnpm preview` (`wrangler dev`, following the vite plugin's `.wrangler/deploy`
// redirect) serves the built output. The tests therefore assert on the wrapping
// the plugin injected at build time, not on anything in the source entry.
export default getPlaywrightConfig(
  {
    startCommand: 'pnpm preview',
    port: 8787,
  },
  {
    workers: '100%',
    retries: 0,
  },
);
