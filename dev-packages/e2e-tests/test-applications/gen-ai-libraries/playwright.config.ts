import { getPlaywrightConfig } from '@sentry-internal/test-utils';
import { RUNTIME } from './tests/constants';

// The same suite runs against both runtimes, selected by the `RUNTIME` env var (see the `sentryTest`
// variants in package.json): the Node entry (runtime channel injection) or the Cloudflare entry (Vite
// build + `@sentry/cloudflare/vite` plugin, served by `vite preview`).
const CF_PORT = 38787;
const NODE_PORT = 3030;

const config = getPlaywrightConfig(
  {
    startCommand: RUNTIME === 'cloudflare' ? 'pnpm dev:cloudflare' : 'pnpm dev:node',
    port: RUNTIME === 'cloudflare' ? CF_PORT : NODE_PORT,
  },
  // Every test drives a real OpenRouter model call (a tool-calling turn does two) and then waits for
  // the gen_ai spans to flush, which does not fit the default 30s test timeout when the provider is
  // slow.
  { timeout: 90_000, retries: 0 },
);

export default config;
