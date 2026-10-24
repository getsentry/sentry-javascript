import * as path from 'node:path';
import type { SentryBuildPluginManager, SourceMapDecision, SourceMapKind, UploadStaging } from '../core';
import { isJsFile } from '../core';
import type { OutputBundle } from './debug-id-stamping';

export type RollupSourceMapSetting = boolean | 'inline' | 'hidden' | undefined;

export type OutputDestinationOptions = { dir?: string; file?: string };

/** Maps Rollup's (and Vite's) `sourcemap` setting onto the plugin's source map kinds. */
export function sourceMapKindFromRollupSetting(setting: RollupSourceMapSetting): SourceMapKind {
  switch (setting) {
    case undefined:
      return 'unset';
    case false:
      return 'off';
    case true:
      return 'visible';
    default:
      return setting;
  }
}

/** The directory an output writes to. Decisions and stagings are keyed by it. */
export function getOutputDestination(outputOptions: OutputDestinationOptions): string {
  return path.resolve(outputOptions.dir ?? path.dirname(outputOptions.file ?? '.'));
}

export type SourceMapHandling = {
  /** Rollup's `outputOptions` hook: decides for the output and switches it to hidden source maps when needed. */
  outputOptions: (
    rawOutputOptions: OutputDestinationOptions & { sourcemap?: RollupSourceMapSetting },
  ) => (OutputDestinationOptions & { sourcemap?: RollupSourceMapSetting }) | null;
  /** Records the decision for an output destination, for bundlers that decide outside `outputOptions`. */
  setDecision: (destination: string, decision: SourceMapDecision) => void;
  /**
   * `generateBundle` with `order: 'post'`: copies each chunk and its source map into a staging folder
   * and drops the map asset from the bundle, so the bundler never writes it.
   */
  stageSourceMaps: (outputOptions: OutputDestinationOptions, bundle: OutputBundle, isWrite?: boolean) => Promise<void>;
  /** Hands the staging of this output to `writeBundle`, first in first out. */
  takeStaging: (outputOptions: OutputDestinationOptions) => UploadStaging | undefined;
};

/**
 * Source map decisions and upload stagings of one plugin instance. Keyed by output destination
 * because one instance can serve several outputs, and watch mode or several `write()` calls
 * rebuild the same one.
 */
export function createSourceMapHandling(sentryBuildPluginManager: SentryBuildPluginManager): SourceMapHandling {
  const decisions = new Map<string, SourceMapDecision>();
  const pendingStagings = new Map<string, UploadStaging[]>();

  return {
    outputOptions: rawOutputOptions => {
      const decision = sentryBuildPluginManager.sourceMaps.decide(
        sourceMapKindFromRollupSetting(rawOutputOptions.sourcemap),
      );
      decisions.set(getOutputDestination(rawOutputOptions), decision);

      return decision.enableHidden ? { ...rawOutputOptions, sourcemap: 'hidden' } : null;
    },

    setDecision: (destination, decision) => {
      decisions.set(destination, decision);
    },

    stageSourceMaps: async (outputOptions, bundle, isWrite) => {
      // `generate()` never reaches `writeBundle`, so nothing would consume the staging.
      if (isWrite === false) {
        return;
      }

      const destination = getOutputDestination(outputOptions);
      if (!decisions.get(destination)?.deleteAfterUpload) {
        return;
      }

      const staging = await sentryBuildPluginManager.createUploadStaging();

      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk' || !isJsFile(output.fileName)) {
          continue;
        }

        const mapFileName = output.sourcemapFileName ?? `${output.fileName}.map`;
        const mapAsset = bundle[mapFileName];
        if (mapAsset?.type !== 'asset' || typeof mapAsset.source !== 'string') {
          continue;
        }

        const result = await staging.stage({
          code: output.code,
          mapSource: mapAsset.source,
          mapDir: path.join(destination, path.dirname(output.fileName)),
          fileName: output.fileName,
        });

        if (result === 'staged') {
          // oxlint-disable-next-line typescript/no-dynamic-delete -- Rollup drops an asset when its key is deleted from the bundle
          delete bundle[mapFileName];
        } else {
          sentryBuildPluginManager.logger.warn(
            `Could not prepare ${output.fileName} for upload, so its source map ${mapFileName} stays in the build output.`,
          );
        }
      }

      const stagings = pendingStagings.get(destination) ?? [];
      stagings.push(staging);
      pendingStagings.set(destination, stagings);
    },

    takeStaging: outputOptions => {
      return pendingStagings.get(getOutputDestination(outputOptions))?.shift();
    },
  };
}
