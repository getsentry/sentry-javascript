import * as path from 'node:path';
import type { SentryBuildPluginManager, SourceMapDecision, SourceMapKind } from '../core';
import type { OutputMatch, RollupSourceMapSetting, SourceMapHandling } from '../rollup/source-map-handling';
import { getOutputMatch, sourceMapKindFromRollupSetting } from '../rollup/source-map-handling';

type BundlerOutput = OutputMatch & { dir?: string; sourcemap?: RollupSourceMapSetting };
type BundlerOutputOptions = BundlerOutput | BundlerOutput[] | undefined;

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

type EnvironmentOutput = {
  destination: string;
  match: OutputMatch;
  sourcemap: RollupSourceMapSetting;
  /** The output sets `sourcemap` itself, which overrides `build.sourcemap`. */
  ownSetting: boolean;
};

/**
 * The outputs an environment writes: one per entry of `rollupOptions.output` or
 * `rolldownOptions.output`. An output writes to `build.outDir` (relative to the root) unless it
 * sets its own `dir`, which the bundler resolves from the working directory. An output's own
 * `sourcemap` overrides `build.sourcemap`.
 */
function getOutputs(root: string, build: ViteBuildOptions): EnvironmentOutput[] {
  const configured = build.rolldownOptions?.output ?? build.rollupOptions?.output;
  const outputs = Array.isArray(configured) ? configured : [configured ?? {}];

  return outputs.map(output => {
    const sourcemap = output.sourcemap ?? build.sourcemap;
    return {
      destination: output.dir === undefined ? path.resolve(root, build.outDir ?? 'dist') : path.resolve(output.dir),
      match: getOutputMatch({ ...output, sourcemap }),
      sourcemap,
      ownSetting: output.sourcemap !== undefined,
    };
  });
}

/**
 * Vite warns about `rollupOptions.output.sourcemap`, so the Vite plugin decides on `build.sourcemap`
 * in a `config` hook. The hook belongs on the post plugin: framework plugins that set
 * `build.sourcemap` themselves run first, and the decision sees the merged setting. The output
 * directories are only known in `configResolved`, which then records the decision for each of them.
 */
export function createViteSourceMapHooks(
  sentryBuildPluginManager: SentryBuildPluginManager,
  sourceMapHandling: SourceMapHandling,
): ViteSourceMapHooks {
  // `'*'` for the top-level setting, otherwise the name of an environment with its own.
  const decisions = new Map<string, { kind: SourceMapKind; decision: SourceMapDecision }>();

  return {
    config: (userConfig, env) => {
      if (env.command !== 'build') {
        return null;
      }

      // The same plugin instances can serve several builds in a row.
      decisions.clear();

      const kind = sourceMapKindFromRollupSetting(userConfig.build?.sourcemap);
      const decision = sentryBuildPluginManager.sourceMaps.decide(kind);
      decisions.set('*', { kind, decision });

      const result: ViteUserConfig = decision.enableHidden ? { build: { sourcemap: 'hidden' } } : {};

      for (const [name, environment] of Object.entries(userConfig.environments ?? {})) {
        const setting = environment?.build?.sourcemap;
        if (setting === undefined) {
          continue;
        }

        const environmentKind = sourceMapKindFromRollupSetting(setting);
        const environmentDecision = sentryBuildPluginManager.sourceMaps.decide(environmentKind);
        decisions.set(name, { kind: environmentKind, decision: environmentDecision });

        if (environmentDecision.enableHidden) {
          result.environments = { ...result.environments, [name]: { build: { sourcemap: 'hidden' } } };
        }
      }

      return result;
    },

    configResolved: config => {
      const environments = config.environments ?? { client: { build: config.build } };

      const { uploadPossible } = sentryBuildPluginManager.sourceMaps;
      const deleteOption = sentryBuildPluginManager.normalizedOptions.sourcemaps?.deleteSourcemapsAfterUpload;

      for (const [name, environment] of Object.entries(environments)) {
        const { kind, decision } = decisions.get(name) ?? decisions.get('*') ?? { kind: 'unset', decision: NO_CHANGE };

        for (const output of getOutputs(config.root, environment.build)) {
          // The plugin never changes an output's own setting, so the user enabled
          // these maps: only hidden ones the user asked to delete are removed.
          if (output.ownSetting) {
            sourceMapHandling.setDecision(output.destination, {
              match: output.match,
              kind: sourceMapKindFromRollupSetting(output.sourcemap),
              decision: {
                enableHidden: false,
                deleteAfterUpload: uploadPossible && deleteOption === true && output.sourcemap === 'hidden',
              },
            });
            continue;
          }

          // A plugin that ran after ours may have changed the setting again.
          if (decision.deleteAfterUpload && output.sourcemap !== 'hidden') {
            sentryBuildPluginManager.logger.debug(
              `Source maps of the "${name}" environment are set to ${JSON.stringify(output.sourcemap)}. Not removing them after upload.`,
            );
            sourceMapHandling.setDecision(output.destination, { match: output.match, kind, decision: NO_CHANGE });
          } else {
            sourceMapHandling.setDecision(output.destination, { match: output.match, kind, decision });
          }
        }
      }
    },
  };
}
