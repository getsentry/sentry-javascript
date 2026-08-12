import { cloudflare } from '@cloudflare/vite-plugin';
import { reactRouter } from '@react-router/dev/vite';
import { sentryReactRouter } from '@sentry/react-router';
import { defineConfig } from 'vite';

export default defineConfig(async config => ({
  plugins: [
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    reactRouter(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...((await sentryReactRouter({ sourcemaps: { disable: true } }, config)) as any[]),
  ],
}));
