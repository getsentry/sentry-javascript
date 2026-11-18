import { withSentryConfig } from '@sentry/nitro';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  // @ts-expect-error The Nitro plugin's types don't accept the config `withSentryConfig` returns
  plugins: [nitro(withSentryConfig({ serverDir: './server', baseURL: '/app/' }))],
});
