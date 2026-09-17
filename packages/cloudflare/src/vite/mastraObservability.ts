import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import MagicString from 'magic-string';

// Namespace binding the injected provider import uses; read back by the integration
// off the global marker.
const PROVIDER_IDENTIFIER = '__SENTRY_MASTRA_OBSERVABILITY__';

// The bundled `@sentry/server-utils` Mastra integration module (ESM build — the only
// one a worker loads). Its `loadMastraObservability` reads `@mastra/observability` off
// the global marker this provider populates, instead of `createRequire`, which cannot
// resolve a package inside a bundled worker.
const MASTRA_INTEGRATION_ID = /@sentry\/server-utils\/build\/esm\/integrations\/mastra\.js$/;

/** Whether `id` is the Sentry Mastra integration module the provider injects into. */
export function isMastraIntegrationModuleId(id: string): boolean {
  const normalizedId = id.replace(/\\/g, '/').replace(/[?#].*$/, '');
  return MASTRA_INTEGRATION_ID.test(normalizedId);
}

/**
 * Splices a static `import * as … from '@mastra/observability'` into Sentry's own
 * Mastra integration module and stashes the namespace on the global orchestrion
 * marker.
 *
 * On Cloudflare the integration cannot `createRequire('@mastra/observability')` to
 * bootstrap Mastra's observability pipeline — there is no on-disk `node_modules` in
 * workerd — so without this the user has to construct and wire up an `Observability`
 * themselves. The import is static (statically analyzable, no lazy `import()`), lands
 * in Sentry's module rather than the user's code, and is only emitted when the package
 * actually resolves; if it is absent, the integration keeps its Node `createRequire`
 * fallback and the marker stays empty.
 */
export function sentryMastraObservabilityProviderPlugin(): {
  name: string;
  configResolved(config: { root: string }): void;
  transform(code: string, id: string): { code: string; map: ReturnType<MagicString['generateMap']> } | undefined;
} {
  let providerSnippet: string | undefined;

  return {
    name: 'sentry-cloudflare-mastra-observability-provider',

    configResolved(config: { root: string }): void {
      // Resolved at build time (Node), so this `createRequire` never ships to the worker.
      try {
        createRequire(resolve(config.root, 'noop.js')).resolve('@mastra/observability');
      } catch {
        return;
      }
      providerSnippet =
        `import * as ${PROVIDER_IDENTIFIER} from '@mastra/observability';\n` +
        '(globalThis.__SENTRY_ORCHESTRION__ = globalThis.__SENTRY_ORCHESTRION__ || {});\n' +
        '(globalThis.__SENTRY_ORCHESTRION__.providedModules = globalThis.__SENTRY_ORCHESTRION__.providedModules || {})' +
        `['@mastra/observability'] = ${PROVIDER_IDENTIFIER};\n`;
    },

    transform(code: string, id: string): { code: string; map: ReturnType<MagicString['generateMap']> } | undefined {
      if (!providerSnippet || !isMastraIntegrationModuleId(id)) return undefined;

      const ms = new MagicString(code);
      ms.prepend(providerSnippet);
      return { code: ms.toString(), map: ms.generateMap({ hires: true }) };
    },
  };
}
