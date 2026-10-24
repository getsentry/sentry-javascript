import * as path from 'node:path';
import type { SentryBuildPluginManager, SourceMapDecision } from '../core';
import type { RollupSourceMapSetting, SourceMapHandling } from '../rollup/source-map-handling';
import { sourceMapKindFromRollupSetting } from '../rollup/source-map-handling';

type BundlerOutputOptions = { dir?: string } | { dir?: string }[] | undefined;

type ViteBuildOptions = {
  sourcemap?: RollupSourceMapSetting;
  outDir?: string;
  rollupOptions?: { output?: BundlerOutputOptions };
  rolldownOptions?: { output?: BundlerOutputOptions };
};

export type ViteUserConfig = {
  build?: ViteBuildOptions;
  environments?: Record<string, { build?: ViteBuildOptions } | undefined>;
};

export type ViteResolvedConfig = {
  root: string;
  build: ViteBuildOptions;
  environments?: Record<string, { build: ViteBuildOptions }>;
};

export type ViteSourceMapHooks = {
  config: (userConfig: ViteUserConfig, env: { command: string }) => ViteUserConfig | null;
  configResolved: (config: ViteResolvedConfig) => void;
};

const NO_CHANGE: SourceMapDecision = { enableHidden: false, deleteAfterUpload: false };

/**
 * The directories an environment writes to: `build.outDir` (relative to the root) unless an output
 * in `rollupOptions` or `rolldownOptions` sets its own `dir`, which the bundler resolves from the
 * working directory.
 */
function getOutputDestinations(root: string, build: ViteBuildOptions): string[] {
  const outputs = build.rolldownOptions?.output ?? build.rollupOptions?.output;
  const outputDirs = (Array.isArray(outputs) ? outputs : [outputs])
    .map(output => output?.dir)
    .filter((dir): dir is string => typeof dir === 'string')
    .map(dir => path.resolve(dir));

  return outputDirs.length > 0 ? outputDirs : [path.resolve(root, build.outDir ?? 'dist')];
}

/**
 * Vite warns about `rollupOptions.output.sourcemap`, so the Vite plugin decides on `build.sourcemap`
 * in its `config` hook. The output directories are only known in `configResolved`, which then
 * records the decision for each of them.
 */
export function createViteSourceMapHooks(
  sentryBuildPluginManager: SentryBuildPluginManager,
  sourceMapHandling: SourceMapHandling,
): ViteSourceMapHooks {
  // `'*'` for the top-level setting, otherwise the name of an environment with its own.
  const decisions = new Map<string, SourceMapDecision>();

  return {
    config: (userConfig, env) => {
      if (env.command !== 'build') {
        return null;
      }

      const decision = sentryBuildPluginManager.sourceMaps.decide(
        sourceMapKindFromRollupSetting(userConfig.build?.sourcemap),
      );
      decisions.set('*', decision);

      const result: ViteUserConfig = decision.enableHidden ? { build: { sourcemap: 'hidden' } } : {};

      for (const [name, environment] of Object.entries(userConfig.environments ?? {})) {
        const setting = environment?.build?.sourcemap;
        if (setting === undefined) {
          continue;
        }

        const environmentDecision = sentryBuildPluginManager.sourceMaps.decide(sourceMapKindFromRollupSetting(setting));
        decisions.set(name, environmentDecision);

        if (environmentDecision.enableHidden) {
          result.environments = { ...result.environments, [name]: { build: { sourcemap: 'hidden' } } };
        }
      }

      return result;
    },

    configResolved: config => {
      const environments = config.environments ?? { client: { build: config.build } };

      for (const [name, environment] of Object.entries(environments)) {
        let decision = decisions.get(name) ?? decisions.get('*') ?? NO_CHANGE;

        // A plugin that ran after ours may have changed the setting again.
        if (decision.deleteAfterUpload && environment.build.sourcemap !== 'hidden') {
          sentryBuildPluginManager.logger.debug(
            `Source maps of the "${name}" environment are set to ${JSON.stringify(environment.build.sourcemap)}. Not removing them after upload.`,
          );
          decision = NO_CHANGE;
        }

        for (const destination of getOutputDestinations(config.root, environment.build)) {
          sourceMapHandling.setDecision(destination, decision);
        }
      }
    },
  };
}
