// EXPERIMENTAL — shared config for the orchestrion bundler plugins. Every
// bundler-specific entry (`vite`, `rollup`, `webpack`, `esbuild`, `bun`) feeds
// this exact same config to its `@apm-js-collab/code-transformer-bundler-plugins`
// plugin, so the set of instrumented libraries and the injected boot banner stay
// identical across bundlers.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CodeTransformerOptions = any;

import { SENTRY_INSTRUMENTATIONS } from '../config';

/**
 * The `@apm-js-collab/code-transformer-bundler-plugins` options shared by every
 * orchestrion bundler plugin.
 *
 * `injectDiagnostics` sets `globalThis.__SENTRY_ORCHESTRION__.bundler = true` at
 * app boot so the `_experimentalSetupOrchestrion()` detector can confirm the
 * bundler path ran (rather than relying on a build-time flag that wouldn't be
 * visible to the runtime).
 */
export function orchestrionTransformOptions(): CodeTransformerOptions {
  return {
    instrumentations: SENTRY_INSTRUMENTATIONS,
    injectDiagnostics: () => {
      return '(globalThis.__SENTRY_ORCHESTRION__=globalThis.__SENTRY_ORCHESTRION__||{}).bundler=true;';
    },
  };
}
