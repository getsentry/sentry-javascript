import cloudflare from '@astrojs/cloudflare';
import sentry from '@sentry/astro/integration';
import { sentryCloudflareVitePlugin } from '@sentry/cloudflare/vite';
import { defineConfig } from 'astro/config';

// Pages needs `@astrojs/cloudflare` 12, which has no `@cloudflare/vite-plugin` for the Sentry plugin to wrap.
const pages = !!process.env.E2E_TEST_CF_PAGES;

export default defineConfig({
  ...(!pages && { base: '/docs', trailingSlash: 'always' }),
  integrations: [sentry({ sourcemaps: { disable: true } })],
  output: 'server',
  adapter: cloudflare(),
  vite: { plugins: pages ? [] : [sentryCloudflareVitePlugin()] },
});
