import codeTransformer from '@apm-js-collab/code-transformer-bundler-plugins/rollup';
import type { NormalizedInputOptions, Plugin, PluginContext } from 'rollup';
import { instrumentedModuleNames } from '../config';
import type { PluginOptions } from './options';
import { externalizedModulesWarning, orchestrionTransformOptions } from './options';
import { resolveOrchestrionRuntimeRequest } from './resolve';

/**
 * Rollup plugin that runs the orchestrion code transform on the bundled output.
 *
 * Use when bundling a Node app with Rollup. For unbundled Node processes use the
 * runtime hook instead (`node --import @sentry/node/orchestrion app.js`).
 *
 * @example
 * ```ts
 * // rollup.config.js
 * import { sentryOrchestrionPlugin } from '@sentry/server-utils/orchestrion/rollup';
 * export default { plugins: [sentryOrchestrionPlugin()] };
 * ```
 */
export function sentryOrchestrionPlugin(options: PluginOptions = {}): Plugin {
  if (options.buildTimeInstrumentation === false) {
    // Inert plugin — no code transform, so no instrumentation lands in the bundle.
    return { name: 'sentry-orchestrion-disabled' };
  }

  const moduleNames = instrumentedModuleNames(options.instrumentations);

  return {
    ...codeTransformer(orchestrionTransformOptions(options)),
    // The module-injected snippet imports `@sentry/server-utils/orchestrion`
    // from INSIDE transformed `node_modules` files. Under isolated installs
    // (pnpm) that bare specifier doesn't resolve from an instrumented package's
    // location, so when normal resolution fails, fall back to this package's
    // own resolution so the helper gets bundled from its real on-disk path.
    async resolveId(this: PluginContext, source: string, importer: string | undefined) {
      if (source !== '@sentry/server-utils/orchestrion') {
        return null;
      }
      const resolved = await this.resolve(source, importer, { skipSelf: true });
      if (resolved) {
        return resolved;
      }
      return resolveOrchestrionRuntimeRequest(source) ?? null;
    },
    buildStart(this: PluginContext, rollupOptions: NormalizedInputOptions): void {
      // Externalized dependencies do not pass through the code transform, so their
      // diagnostics_channel calls are never injected. Rollup provides `external` as
      // a function, but other Rollup-compatible bundlers may not. Skip this optional
      // warning when the bundler uses a different format (e.g. Rolldown).
      if (typeof rollupOptions.external !== 'function') {
        return;
      }

      const externalizedModules = moduleNames.filter(name => rollupOptions.external(name, undefined, false));
      if (externalizedModules.length > 0) {
        this.warn(externalizedModulesWarning(externalizedModules));
      }
    },
  };
}
