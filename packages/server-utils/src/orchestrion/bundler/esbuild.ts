import codeTransformer from '@apm-js-collab/code-transformer-bundler-plugins/esbuild';
import type { Plugin } from 'esbuild';
import { escapeStringForRegex } from '@sentry/core';
import { instrumentedModuleNames } from '../config';
import type { PluginOptions } from './options';
import { externalEntryMatchesModule, externalizedModulesWarning, orchestrionTransformOptions } from './options';

// esbuild `external` entries may contain `*` wildcards.
function matchesEsbuildExternal(entry: string, moduleName: string): boolean {
  if (entry.includes('*')) {
    return new RegExp(`^${entry.split('*').map(escapeStringForRegex).join('.*')}$`).test(moduleName);
  }
  return externalEntryMatchesModule(entry, moduleName);
}

/**
 * esbuild plugin that runs the orchestrion code transform on the bundled output.
 *
 * Use when bundling a Node app with esbuild. For unbundled Node processes use the
 * runtime hook instead (`node --import @sentry/node/orchestrion app.js`).
 *
 * Instrumented packages marked as `external` never pass through the code
 * transform, so a build warning is emitted for them.
 *
 * @example
 * ```ts
 * // build.mjs
 * import { sentryOrchestrionPlugin } from '@sentry/server-utils/orchestrion/esbuild';
 * await esbuild.build({ plugins: [sentryOrchestrionPlugin()] });
 * ```
 */
export function sentryOrchestrionPlugin(options: PluginOptions = {}): Plugin {
  if (options.buildTimeInstrumentation === false) {
    // Inert plugin — no code transform, so no instrumentation lands in the bundle.
    return { name: 'sentry-orchestrion-disabled', setup: () => undefined };
  }

  const plugin = codeTransformer(orchestrionTransformOptions(options));
  const moduleNames = instrumentedModuleNames(options.instrumentations);
  const setup = plugin.setup;

  return {
    ...plugin,
    setup(build): ReturnType<typeof setup> {
      const external = build.initialOptions.external || [];
      const externalizedModules = moduleNames.filter(name =>
        external.some(entry => matchesEsbuildExternal(entry, name)),
      );
      if (externalizedModules.length > 0) {
        build.onStart(() => ({ warnings: [{ text: externalizedModulesWarning(externalizedModules) }] }));
      }
      return setup(build);
    },
  };
}
