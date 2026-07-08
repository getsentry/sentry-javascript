import codeTransformer from '@apm-js-collab/code-transformer-bundler-plugins/esbuild';
import { withoutInstrumentedExternals } from '../config';
import { orchestrionTransformOptions } from './options';

// Minimal shape of esbuild's `PluginBuild` that we touch, so we don't depend on
// the `esbuild` types. The upstream transform reads more off `build`
// (`onStart`/`onLoad`/`onEnd`), but we only forward `build` through to it and
// mutate `initialOptions.external`.
interface EsbuildPluginBuild {
  initialOptions: { external?: string[] };
}

/**
 * esbuild plugin that runs the orchestrion code transform on the bundled output.
 *
 * Use when bundling a Node app with esbuild. For unbundled Node processes use the
 * runtime hook instead (`node --import @sentry/node/orchestrion app.js`).
 *
 * esbuild does not flatten nested `plugins` arrays, so this returns a single
 * plugin that strips instrumented packages from an `external` denylist before
 * delegating to the upstream transform.
 *
 * @example
 * ```ts
 * // build.mjs
 * import { sentryOrchestrionPlugin } from '@sentry/server-utils/orchestrion/esbuild';
 * await esbuild.build({ plugins: [sentryOrchestrionPlugin()] });
 * ```
 */
export function sentryOrchestrionPlugin(): ReturnType<typeof codeTransformer> {
  const transformer = codeTransformer(orchestrionTransformOptions()) as unknown as {
    setup: (build: EsbuildPluginBuild) => void;
  };

  return {
    name: 'sentry-orchestrion',
    setup(build: EsbuildPluginBuild): void {
      // Strip instrumented packages from an `external` denylist so esbuild
      // bundles them and the transform's `onLoad` actually sees their source;
      // an externalized dependency is resolved from `node_modules` at runtime
      // and never gets the diagnostics_channel calls injected. Mutating
      // `initialOptions` inside `setup` is respected by esbuild — the upstream
      // plugin sets `initialOptions.metafile` the same way.
      build.initialOptions.external = withoutInstrumentedExternals(build.initialOptions.external);
      transformer.setup(build);
    },
  };
}
