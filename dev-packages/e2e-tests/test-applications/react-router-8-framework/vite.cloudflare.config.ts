import { cloudflare } from '@cloudflare/vite-plugin';
import { reactRouter } from '@react-router/dev/vite';
import { sentryCloudflareVitePlugin } from '@sentry/cloudflare/vite';
import { sentryReactRouter } from '@sentry/react-router/vite';
import { defineConfig } from 'vite';

export default defineConfig(async config => ({
  plugins: [
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    reactRouter(),
    sentryCloudflareVitePlugin(),
    ...((await sentryReactRouter(
      // Both Sentry plugins inject the orchestrion snippet, and injecting it twice fails the build.
      { sourcemaps: { disable: true }, buildTimeInstrumentation: false },
      config,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    )) as any[]),
  ],
}));
