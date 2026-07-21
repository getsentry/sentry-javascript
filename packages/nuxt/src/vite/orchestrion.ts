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
 */
export function setupOrchestrion(nuxt: Nuxt): void {
  nuxt.hook('nitro:config', (nitroConfig: NitroConfig) => {
    if (nuxt.options?._prepare) {
      return;
    }

    nitroConfig.rollupConfig ??= {};

    if (nitroConfig.rollupConfig.plugins === null || nitroConfig.rollupConfig.plugins === undefined) {
      nitroConfig.rollupConfig.plugins = [];
    } else if (!Array.isArray(nitroConfig.rollupConfig.plugins)) {
      nitroConfig.rollupConfig.plugins = [nitroConfig.rollupConfig.plugins];
    }

    nitroConfig.rollupConfig.plugins.push(sentryOrchestrionPlugin());

    const externals = (nitroConfig.externals ||= {});
    const inline = externals.inline;
    const existingInline = Array.isArray(inline) ? inline : inline ? [inline] : [];
    externals.inline = [...new Set([...existingInline, ...INSTRUMENTED_MODULE_NAMES, ...IORedisDependencies])];
  });
}
