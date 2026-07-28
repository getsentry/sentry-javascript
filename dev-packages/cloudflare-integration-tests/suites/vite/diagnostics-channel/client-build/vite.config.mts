import { cloudflare } from '@cloudflare/vite-plugin';
import { sentryCloudflareVitePlugin } from '@sentry/cloudflare/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    cloudflare(),
    sentryCloudflareVitePlugin({
      _experimental: {
        useDiagnosticsChannelInjection: true,
      },
    }),
  ],
});
