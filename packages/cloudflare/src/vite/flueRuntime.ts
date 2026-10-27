import type { ProvidedModulePlugin } from './providedModulePlugin';
import { createProvidedModulePlugin } from './providedModulePlugin';

/**
 * Splices a static `import * as … from '@flue/runtime'` into Sentry's own Flue integration module
 * and exposes the namespace on the global orchestrion marker.
 *
 * Flue is registered rather than patched — `instrument()` writes into module-scope state — so
 * instrumenting it needs that module's own binding, and no channel payload carries one. On Node the
 * user passes it by calling `instrument()` themselves; a bundled worker has no `node_modules` to
 * resolve from, so it is supplied at build time instead.
 */
export function sentryFlueRuntimeProviderPlugin(): ProvidedModulePlugin {
  return createProvidedModulePlugin({
    name: 'sentry-cloudflare-flue-runtime-provider',
    moduleName: '@flue/runtime',
    identifier: '__SENTRY_FLUE_RUNTIME__',
    integrationModule: 'flue',
  });
}
