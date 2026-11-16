import node from '@astrojs/node';
import sentry from '@sentry/astro/integration';
import { defineConfig } from 'astro/config';

export default defineConfig({
  base: '/docs',
  trailingSlash: 'always',
  integrations: [sentry({ sourcemaps: { disable: true } })],
  output: 'server',
  adapter: node({ mode: 'standalone' }),
});
