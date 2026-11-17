import { defineConfig } from 'vite';
import tsConfigPaths from 'vite-tsconfig-paths';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';
import { sentryTanstackStart } from '@sentry/tanstackstart-react/vite';

export default defineConfig({
  server: {
    port: 3030,
  },
  plugins: [
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tsConfigPaths(),
    tanstackStart(),
    viteReact(),
    sentryTanstackStart({ tunnelRoute: '/monitoring', sourcemaps: { disable: true } }),
  ],
});
