import { sentryCloudflareVitePlugin } from '@sentry/cloudflare/vite';
import { defineConfig } from 'vite';

// Builds the agent worker with the orchestrion diagnostics-channel injection applied, so the
// `agents` package's `_executeScheduleCallback` / `_runFiberInternal` get `tracingChannel` calls
// spliced in (and `__SENTRY_ORCHESTRION__.bundler` is set). The test then runs the built output so
// the channel-driven spans are exercised for real.
//
// `noExternal: ['agents']` force-bundles `agents` so the transform sees its source (Vite
// externalizes SSR deps by default); `cloudflare:*` / `node:*` stay external (workerd builtins).
export default defineConfig({
  ssr: { noExternal: ['agents'] },
  build: {
    ssr: 'index.ts',
    outDir: 'dist',
    minify: false,
    rollupOptions: {
      external: [/^cloudflare:/, /^node:/],
      output: { format: 'esm', entryFileNames: 'index.js' },
    },
  },
  plugins: [sentryCloudflareVitePlugin({ _experimental: { useDiagnosticsChannelInjection: true } })],
});
