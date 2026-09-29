import type { RegisteredWasmImage } from './registry';

/**
 * Maps Chrome `wasm://wasm/<name>-<hash>` frames to a registered `code_file`.
 *
 * V8 builds the label from the wasm `name` section, which is parsed into
 * `moduleName` at registration. A hit is accepted only when every image with
 * that name shares one `debug_id`, since a page and a worker can register the
 * same binary under different URLs.
 *
 * Hash-only `wasm://wasm/<hash>` labels carry no name and are not mapped
 * (see #23781).
 */

export type SyntheticWasmImageHit = {
  index: number;
  worker: boolean;
  codeFile: string;
};

/**
 * Module name from Chrome's label: `wasm://wasm/demo.wasm-000197f6` → `demo.wasm`.
 *
 * V8 appends the `-<hash>` suffix only after a module name. A label without
 * it is hash-only and yields `undefined`, so a hex-looking module name such
 * as `ed25519` is still returned.
 */
export function syntheticModuleName(filename: string): string | undefined {
  const body = filename.match(/^wasm:\/\/wasm\/(.+)$/i)?.[1];
  if (!body) {
    return undefined;
  }
  const name = body.replace(/-[0-9a-fA-F]{6,16}$/, '');
  return name === body ? undefined : name;
}

export function uniqueImageForSyntheticFilename(
  filename: string,
  pageImages: ReadonlyArray<RegisteredWasmImage>,
  workerImages: ReadonlyArray<RegisteredWasmImage>,
): SyntheticWasmImageHit | undefined {
  const name = syntheticModuleName(filename);
  if (!name) {
    return undefined;
  }

  const hits: Array<SyntheticWasmImageHit & { debugId: string }> = [];
  const consider = (images: ReadonlyArray<RegisteredWasmImage>, worker: boolean): void => {
    images.forEach((image, index) => {
      if (image.moduleName === name) {
        hits.push({ index, worker, codeFile: image.code_file, debugId: image.debug_id });
      }
    });
  };
  consider(pageImages, false);
  consider(workerImages, true);

  const hit = hits[0];
  if (!hit || hits.some(other => other.debugId !== hit.debugId)) {
    return undefined;
  }
  return { index: hit.index, worker: hit.worker, codeFile: hit.codeFile };
}
