import type { Nuxt } from '@nuxt/schema';
import { INSTRUMENTED_MODULE_NAMES } from '@sentry/server-utils/orchestrion/config';
import { sentryOrchestrionPlugin } from '@sentry/server-utils/orchestrion/rollup';
import type { NitroConfig } from 'nitropack';

// ioredis requires this CommonJS helper to be bundled with it. Leaving it
// external makes Nitro resolve the default export as a namespace object.
const IORedisDependencies = ['standard-as-callback'];

/**
 * Configures Nitro to bundle and transform dependencies that publish tracing
 * events through diagnostics channels.
 *
 * `hasServerConfig` reflects whether a `sentry.server.config` file was found. On Node the SDK is
 * initialized from that file, so orchestrion only makes sense when it exists. On Cloudflare the SDK
 * is initialized through `sentryCloudflareNitroPlugin` instead (no server config file), so the
 * transform must still run there — detected via the Nitro preset.
 */
export function setupOrchestrion(nuxt: Nuxt, hasServerConfig: boolean, buildTimeInstrumentation?: boolean): void {
  if (buildTimeInstrumentation === false) {
    return;
  }

  nuxt.hook('nitro:config', (nitroConfig: NitroConfig) => {
    if (nuxt.options?._prepare) {
      return;
    }

    // On Cloudflare (workerd) the SDK is initialized through `sentryCloudflareNitroPlugin` (no
    // server config file), so the transform must still run there — detected via the Nitro preset.
    // Nitro normalizes preset names, so match any `cloudflare*` spelling.
    const isCloudflare = !!nitroConfig.preset?.replace(/-/g, '_').startsWith('cloudflare');

    if (!hasServerConfig && !isCloudflare) {
      return;
    }

    nitroConfig.rollupConfig ??= {};

    if (nitroConfig.rollupConfig.plugins === null || nitroConfig.rollupConfig.plugins === undefined) {
      nitroConfig.rollupConfig.plugins = [];
    } else if (!Array.isArray(nitroConfig.rollupConfig.plugins)) {
      nitroConfig.rollupConfig.plugins = [nitroConfig.rollupConfig.plugins];
    }

    nitroConfig.rollupConfig.plugins.push(sentryOrchestrionPlugin({}));

    const externals = (nitroConfig.externals ||= {});
    const inline = externals.inline;
    const existingInline = Array.isArray(inline) ? inline : inline ? [inline] : [];
    externals.inline = [...new Set([...existingInline, ...INSTRUMENTED_MODULE_NAMES, ...IORedisDependencies])];
  });
}
