import type { ProvidedModulePlugin } from './providedModulePlugin';
import { createProvidedModulePlugin } from './providedModulePlugin';

/**
 * Splices a static `import * as … from '@mastra/observability'` into Sentry's own Mastra
 * integration module and stashes the namespace on the global orchestrion marker.
 *
 * On Cloudflare the integration cannot `createRequire('@mastra/observability')` to bootstrap
 * Mastra's observability pipeline — there is no on-disk `node_modules` in workerd — so without
 * this the user has to construct and wire up an `Observability` themselves. If the package is
 * absent, the integration keeps its Node `createRequire` fallback and the marker stays empty.
 */
export function sentryMastraObservabilityProviderPlugin(): ProvidedModulePlugin {
  return createProvidedModulePlugin({
    name: 'sentry-cloudflare-mastra-observability-provider',
    moduleName: '@mastra/observability',
    identifier: '__SENTRY_MASTRA_OBSERVABILITY__',
    integrationModule: 'mastra',
  });
}
