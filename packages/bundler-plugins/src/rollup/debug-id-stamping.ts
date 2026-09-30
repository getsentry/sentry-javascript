import { isJsFile, stampDebugId } from '../core';

export type OutputBundle = Record<
  string,
  | { type: 'chunk'; fileName: string; code: string; sourcemapFileName?: string | null }
  | { type: 'asset'; fileName: string; source: string | Uint8Array }
>;

export function stampDebugIds(bundle: OutputBundle, updateChunkCode: boolean): void {
  for (const output of Object.values(bundle)) {
    if (output.type !== 'chunk' || !isJsFile(output.fileName)) {
      continue;
    }

    const sourceMapAsset = bundle[output.sourcemapFileName ?? `${output.fileName}.map`];
    const sourceMapSource =
      sourceMapAsset?.type === 'asset' && typeof sourceMapAsset.source === 'string'
        ? sourceMapAsset.source
        : undefined;

    const stamped = stampDebugId(output.code, sourceMapSource);
    if (!stamped) {
      continue;
    }

    if (updateChunkCode) {
      output.code = stamped.bundleSource;
    }
    if (stamped.sourceMapSource !== undefined && sourceMapAsset?.type === 'asset') {
      sourceMapAsset.source = stamped.sourceMapSource;
    }
  }
}
