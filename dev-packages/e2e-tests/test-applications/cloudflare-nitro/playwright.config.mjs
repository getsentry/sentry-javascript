import { getPlaywrightConfig } from '@sentry-internal/test-utils';

// `vite build` produces the Cloudflare worker under `.output` (with the orchestrion transform
// applied); `pnpm preview` serves it with `wrangler dev`.
export default getPlaywrightConfig(
  {
    startCommand: 'pnpm preview',
    port: 3030,
  },
  {
    workers: '100%',
    retries: 0,
  },
);
