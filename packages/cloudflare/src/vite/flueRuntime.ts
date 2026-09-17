import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import MagicString from 'magic-string';

// Namespace binding the injected provider import uses; read back by the integration
// off the global marker.
const PROVIDER_IDENTIFIER = '__SENTRY_FLUE_RUNTIME__';

const FLUE_MODULE = '@flue/runtime';

// The bundled `@sentry/server-utils` Flue integration module (ESM build — the only one a
// worker loads). It reads `@flue/runtime` off the global marker this provider populates,
// because `instrument()` registers into module-scope state that cannot be reached from a
// diagnostics channel.
const FLUE_INTEGRATION_ID = /@sentry\/server-utils\/build\/esm\/integrations\/flue\.js$/;

/** Whether `id` is the Sentry Flue integration module the provider injects into. */
export function isFlueIntegrationModuleId(id: string): boolean {
  const normalizedId = id.replace(/\\/g, '/').replace(/[?#].*$/, '');
  return FLUE_INTEGRATION_ID.test(normalizedId);
}

/**
 * Splices a static `import * as … from '@flue/runtime'` into Sentry's own Flue integration
 * module and stashes the namespace on the global orchestrion marker.
 *
 * Flue is registered rather than patched: `instrument()` writes into module-scope state, so
 * instrumenting it needs a reference to that module's own binding, and no channel payload
 * carries one. On Node the user supplies it by calling `instrument()` themselves; in a
 * bundled worker this provider supplies it at build time instead, so the integration can
 * register on its own. The import is static (statically analyzable, no lazy `import()`),
 * lands in Sentry's module rather than the user's code, and is only emitted when the package
 * actually resolves; if it is absent the marker stays empty and the integration no-ops.
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
      // Resolved at build time (Node), so none of this ships to the worker. `@flue/runtime` is
      // ESM-only with no `require` condition, so `createRequire().resolve()` throws
      // `ERR_PACKAGE_PATH_NOT_EXPORTED` on it — resolve through the ESM resolver instead, and only
      // fall back to CJS for hosts where `import.meta.resolve` is unavailable.
      const from = pathToFileURL(resolve(config.root, 'noop.js'));
      try {
        import.meta.resolve(FLUE_MODULE, from.href);
      } catch {
        try {
          createRequire(from).resolve(FLUE_MODULE);
        } catch {
          return;
        }
      }
      // A getter, not a snapshot: the snippet is prepended to Sentry's module, which the bundler
      // may evaluate before `@flue/runtime`'s namespace is initialized. Assigning the namespace
      // there stores `undefined` — the key appears on `providedModules` with nothing behind it.
      // Reading it through a getter defers that to first access, by which point it is populated.
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
