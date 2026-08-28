import { isJsFile, stampDebugId, warnAboutInlineSourceMaps } from '../core';
import type { Logger } from '../core';

// The subset of Rollup's `OutputBundle` the stamping hook reads.
type OutputBundle = Record<
  string,
  | { type: 'chunk'; fileName: string; code: string; sourcemapFileName?: string | null }
  | { type: 'asset'; fileName: string; source: string | Uint8Array }
>;

/**
 * Creates the `generateBundle` hook that stamps debug IDs into the emitted chunks and source maps.
 *
 * `disable-upload` skips the upload routine (which stamps debug IDs into temp copies), so the emitted
 * artifacts get stamped here instead. Not in `renderChunk`: minifiers running after it would strip the
 * comment. Rollup computes `[hash]` file names before this hook, so only plugins that hash the final
 * assets afterwards (e.g. subresource integrity) see the stamped content.
 */
export function createDebugIdStampingHook(logger: Logger) {
  return function generateBundle(_outputOptions: unknown, bundle: OutputBundle): void {
    const inlineSourceMapBundles: string[] = [];

    for (const output of Object.values(bundle)) {
      if (output.type !== 'chunk' || !isJsFile(output.fileName)) {
        continue;
      }

      const sourceMapAsset = bundle[output.sourcemapFileName ?? `${output.fileName}.map`];
      const sourceMapSource =
        sourceMapAsset?.type === 'asset' && typeof sourceMapAsset.source === 'string'
          ? sourceMapAsset.source
          : undefined;

      const result = stampDebugId(output.code, sourceMapSource);
      if (result.kind === 'skipped') {
        continue;
      }

      output.code = result.bundleSource;
      if (result.kind === 'inline-source-map') {
        inlineSourceMapBundles.push(output.fileName);
      } else if (sourceMapAsset?.type === 'asset') {
        sourceMapAsset.source = result.sourceMapSource;
      }
    }

    warnAboutInlineSourceMaps(inlineSourceMapBundles, logger);
  };
}
