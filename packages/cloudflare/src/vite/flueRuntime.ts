import type { ProvidedModulePlugin } from './providedModulePlugin';
import { createProvidedModulePlugin } from './providedModulePlugin';

/**
 * Splices a static `import * as … from '@flue/runtime'` into the Cloudflare SDK's own setup module
 * and exposes the namespace on the global orchestrion marker.
 *
 * Flue is registered rather than patched — `instrument()` writes into module-scope state — so
 * instrumenting it needs that module's own binding, and no channel payload carries one. On Node the
 * user passes it by calling `instrument()` themselves; a bundled worker has no `node_modules` to
 * resolve from, so it is supplied at build time instead.
 *
 * Not into `@sentry/server-utils`: every orchestrion-instrumented module imports that package, so
 * the import would close a cycle through any instrumented package Flue depends on. pi-ai is one:
 * when a Flue entry loads pi-ai first, Flue's own module-level `createModels()` would run before
 * pi-ai's `ModelsImpl` is initialized and the worker fails at startup.
 */
export function sentryFlueRuntimeProviderPlugin(): ProvidedModulePlugin {
  return createProvidedModulePlugin({
    name: 'sentry-cloudflare-flue-runtime-provider',
    moduleName: '@flue/runtime',
    identifier: '__SENTRY_FLUE_RUNTIME__',
    targetModules: ['@sentry/cloudflare/build/esm/prod/baseSdk.js', '@sentry/cloudflare/build/esm/dev/baseSdk.js'],
  });
}
