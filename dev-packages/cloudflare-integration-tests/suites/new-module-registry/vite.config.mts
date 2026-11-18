import { cloudflare } from '@cloudflare/vite-plugin';
import { sentryCloudflareVitePlugin } from '@sentry/cloudflare/vite';
import { defineConfig } from 'vite';
import { supports } from '../../runtime';

export default defineConfig({
  plugins: [
    cloudflare({
      // Older workerd versions refuse to start with compatibility date 2026-11-17, the date from which the new module
      // registry is the default, so they get the registry through its flag instead.
      config: supports({ minWorkerd: '1.20261117.1' })
        ? {}
        : { compatibility_date: '2025-06-17', compatibility_flags: ['new_module_registry'] },
    }),
    sentryCloudflareVitePlugin(),
  ],
});
