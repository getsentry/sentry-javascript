import codeTransformer from '@apm-js-collab/code-transformer-bundler-plugins/vite';
import type { Plugin, ResolvedConfig } from 'vite';
import { instrumentedModuleNames } from '../config';
import type { PluginOptions } from './options';
import { externalEntryMatchesModule, externalizedModulesWarning, orchestrionTransformOptions } from './options';

/**
 * Vite plugin that runs the orchestrion code transform on the bundled output.
 *
 * Use when bundling a Node app with Vite (e.g. Vite SSR builds, Nuxt's Nitro
 * pipeline, SvelteKit). For unbundled Node processes use the runtime hook
 * instead (`node --import @sentry/node/orchestrion app.js`).
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { sentryOrchestrionPlugin } from '@sentry/server-utils/orchestrion/vite';
 * export default { plugins: [sentryOrchestrionPlugin()] };
 * ```
 */
export function sentryOrchestrionPlugin(options: PluginOptions = {}): Plugin {
  return {
    ...codeTransformer(orchestrionTransformOptions(options)),
    applyToEnvironment(environment) {
      // Orchestrion splices `node:diagnostics_channel` calls into instrumented modules, which only
      // exist server-side. Only apply to server-consumed environments so injected `tracingChannel`
      // calls never land in a browser (`client`) bundle (where they'd throw `X is not a function`).
      return environment.config.consumer === 'server';
    },
    config(): { ssr: { noExternal: string[] } } {
      // Force-bundle every instrumented package so the code transform actually
      // sees its source. Vite externalizes dependencies in SSR builds by
      // default, leaving them as bare `require()`/`import` calls resolved from
      // `node_modules` at runtime — those copies are untouched and the
      // diagnostics_channel calls never get injected. Vite merges array
      // `noExternal` entries with the user's config, so we don't overwrite
      // their additions.
      return { ssr: { noExternal: instrumentedModuleNames(options.instrumentations) } };
    },
    configResolved(config: ResolvedConfig): void {
      // Explicit `ssr.external` string entries take priority over `noExternal`
      // in Vite, so they defeat the force-bundling above. (`ssr.external: true`
      // does not — `noExternal` entries still win there.)
      const external = config.ssr?.external;
      if (!Array.isArray(external)) {
        return;
      }
      const moduleNames = instrumentedModuleNames(options.instrumentations);
      const externalizedModules = moduleNames.filter(name =>
        external.some(entry => externalEntryMatchesModule(entry, name)),
      );
      if (externalizedModules.length > 0) {
        config.logger.warn(`[Sentry] ${externalizedModulesWarning(externalizedModules)}`);
      }
    },
  };
}
