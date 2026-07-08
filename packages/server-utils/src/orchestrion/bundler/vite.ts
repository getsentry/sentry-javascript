import codeTransformer from '@apm-js-collab/code-transformer-bundler-plugins/vite';
import { INSTRUMENTED_MODULE_NAMES } from '../config';
import { orchestrionTransformOptions } from './options';

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
export function sentryOrchestrionPlugin(): ReturnType<typeof codeTransformer> {
  return {
    ...codeTransformer(orchestrionTransformOptions()),
    config(): { ssr: { noExternal: string[] } } {
      // Force-bundle every instrumented package so the code transform actually
      // sees its source. Vite externalizes dependencies in SSR builds by
      // default, leaving them as bare `require()`/`import` calls resolved from
      // `node_modules` at runtime — those copies are untouched and the
      // diagnostics_channel calls never get injected. Vite merges array
      // `noExternal` entries with the user's config, so we don't overwrite
      // their additions.
      return { ssr: { noExternal: INSTRUMENTED_MODULE_NAMES } };
    },
  };
}
