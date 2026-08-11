import { getPlaywrightConfig } from '@sentry-internal/test-utils';

// The bug this app guards against only reproduces against the *built* Worker:
// `@sveltejs/adapter-cloudflare`'s dev platform proxy still sets the legacy
// `platform.context` alias, while the emitted worker only sets `platform.ctx`.
// So we serve the build output with `wrangler dev` rather than running `vite dev`.
const config = getPlaywrightConfig({
  startCommand: 'pnpm preview',
  port: 4173,
});

export default config;
