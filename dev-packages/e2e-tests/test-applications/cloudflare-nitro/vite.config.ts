import { INSTRUMENTED_MODULE_NAMES } from '@sentry/server-utils/orchestrion/config';
import { sentryOrchestrionPlugin } from '@sentry/server-utils/orchestrion/rollup';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';

// A raw Nitro app targeting Cloudflare. There is no `@sentry/nitro` Cloudflare init helper, so this
// mirrors what `@sentry/nuxt` does for Nitro-on-Cloudflare by hand:
//   1. Bundle for the `cloudflare_module` preset with `nodeCompat` (Nitro's Cloudflare presets need
//      the `nodejs_compat` flag, which is also what makes `node:diagnostics_channel` available).
//   2. Run the orchestrion transform over Nitro's server bundle and force the instrumented packages
//      to be inlined (an externalized dependency never passes through the transform). This is what
//      injects the registration snippet into `h3`/`unstorage`, which registers `nitroIntegration`
//      and `nitroServerTimingIntegration` on the Cloudflare SDK at `init()`.
export default defineConfig({
  plugins: [
    nitro({
      preset: 'cloudflare_module',
      cloudflare: {
        nodeCompat: true,
        deployConfig: false,
      },
      // Nitro 3 builds the server bundle with rolldown when driven through `nitro/vite`, so the
      // transform goes in `rolldownConfig`. `rollupConfig` is kept too so this also works if the
      // build ever falls back to the rollup builder — the orchestrion plugin supports both.
      rolldownConfig: {
        plugins: [sentryOrchestrionPlugin({})],
      },
      rollupConfig: {
        plugins: [sentryOrchestrionPlugin({})],
      },
      externals: {
        inline: [...INSTRUMENTED_MODULE_NAMES],
      },
    }),
  ],
});
