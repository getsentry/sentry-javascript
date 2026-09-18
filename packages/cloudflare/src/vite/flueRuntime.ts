import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import MagicString from 'magic-string';

// Namespace binding the injected provider import uses; read back by the integration
// off the global marker.
const PROVIDER_IDENTIFIER = '__SENTRY_FLUE_RUNTIME__';

const FLUE_MODULE = '@flue/runtime';

// The bundled `@sentry/server-utils` Flue integration module (ESM build — the only one a
// worker loads). It reads `@flue/runtime` off the global marker this provider populates,
// because `instrument()` registers into module-scope state no channel payload can carry.
const FLUE_INTEGRATION_ID = /@sentry\/server-utils\/build\/esm\/integrations\/flue\.js$/;

/** Whether `id` is the Sentry Flue integration module the provider injects into. */
export function isFlueIntegrationModuleId(id: string): boolean {
  const normalizedId = id.replace(/\\/g, '/').replace(/[?#].*$/, '');
  return FLUE_INTEGRATION_ID.test(normalizedId);
}

/**
 * Splices a static `import * as … from '@flue/runtime'` into Sentry's own Flue integration module
 * and exposes the namespace on the global orchestrion marker.
 *
 * Flue is registered rather than patched — `instrument()` writes into module-scope state — so
 * instrumenting it needs that module's own binding, and no channel payload carries one. On Node the
 * user passes it by calling `instrument()` themselves; a bundled worker has no `node_modules` to
 * resolve from, so it is supplied at build time instead.
 */
export function sentryFlueRuntimeProviderPlugin(): {
  name: string;
  configResolved(config: { root: string }): void;
  transform(code: string, id: string): { code: string; map: ReturnType<MagicString['generateMap']> } | undefined;
} {
  let providerSnippet: string | undefined;

  return {
    name: 'sentry-cloudflare-flue-runtime-provider',

    configResolved(config: { root: string }): void {
      // Build-time only; never ships to the worker. `@flue/runtime` is ESM-only, so an installed
      // copy throws `ERR_PACKAGE_PATH_NOT_EXPORTED` and only a missing one throws `MODULE_NOT_FOUND`.
      // Not `import.meta.resolve`: `parentURL` is ignored without a flag, and it is absent from the
      // CJS build.
      try {
        createRequire(resolve(config.root, 'noop.js')).resolve(FLUE_MODULE);
      } catch (error) {
        if ((error as NodeJS.ErrnoException | undefined)?.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED') {
          return;
        }
      }
      // A getter where Mastra assigns: the bundler may evaluate Sentry's module before
      // `@flue/runtime` is initialized, and assigning there would store `undefined`.
      providerSnippet =
        `import * as ${PROVIDER_IDENTIFIER} from '${FLUE_MODULE}';\n` +
        '(globalThis.__SENTRY_ORCHESTRION__ = globalThis.__SENTRY_ORCHESTRION__ || {});\n' +
        '(globalThis.__SENTRY_ORCHESTRION__.providedModules = globalThis.__SENTRY_ORCHESTRION__.providedModules || {});\n' +
        `Object.defineProperty(globalThis.__SENTRY_ORCHESTRION__.providedModules, '${FLUE_MODULE}', ` +
        `{ configurable: true, get() { return ${PROVIDER_IDENTIFIER}; } });\n`;
    },

    transform(code: string, id: string): { code: string; map: ReturnType<MagicString['generateMap']> } | undefined {
      if (!providerSnippet || !isFlueIntegrationModuleId(id)) return undefined;

      const ms = new MagicString(code);
      ms.prepend(providerSnippet);
      return { code: ms.toString(), map: ms.generateMap({ hires: true }) };
    },
  };
}
