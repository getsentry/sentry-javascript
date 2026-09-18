import type { RegisteredWasmImage } from './registry';

/**
 * Maps Chrome `wasm://wasm/<name>-<hash>` frames to a registered `code_file`.
 *
 * V8 builds the label from the wasm `name` section, so an image with a parsed
 * `moduleName` matches on that name only. Images without one are guessed from
 * the fetch URL basename (including wasm-bindgen `_bg.wasm` → `.wasm`). Hits
 * are accepted only when every candidate shares one `debug_id`.
 *
 * Hash-only `wasm://wasm/<hash>` labels carry no name and are not mapped
 * (see #23781).
 *
 * Fetch-URL frames (`http://…/file.wasm:wasm-function[…]`) still use exact
 * `code_file` lookup in `patchFrames`, not this matcher.
 */

export type SyntheticWasmImageHit = {
  index: number;
  worker: boolean;
  codeFile: string;
};

type Hit = SyntheticWasmImageHit & { debugId: string };

/** Last path segment of a registered wasm URL (`http://…/demo_bg.wasm` → `demo_bg.wasm`). */
export function fileBasename(url: string): string | undefined {
  try {
    return new URL(url).pathname.split('/').pop() || undefined;
  } catch {
    return url.split('/').pop();
  }
}

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

/**
 * Fetch filename plus known packaging aliases.
 *
 * wasm-bindgen writes `foo_bg.wasm` next to `foo.js` but the stack label is often
 * `foo.wasm`. Used only for images without a parsed name section.
 */
export function namesForRegisteredWasm(codeFile: string): string[] {
  const basename = fileBasename(codeFile);
  if (!basename) {
    return [];
  }

  const names = [basename];
  const withoutBindgenBg = basename.replace(/_bg\.wasm$/i, '.wasm');
  if (withoutBindgenBg !== basename) {
    names.push(withoutBindgenBg);
  }
  return names;
}

function imageMatchesSyntheticName(image: RegisteredWasmImage, syntheticName: string): boolean {
  if (image.moduleName) {
    return image.moduleName === syntheticName;
  }
  return namesForRegisteredWasm(image.code_file).includes(syntheticName);
}

/**
 * Multiple URLs may register the same binary. Only use a hit when every candidate
 * shares one `debug_id`. Different binaries with the same name stay unmatched.
 */
export function uniqueHitByDebugId<T extends { debugId: string }>(hits: T[]): T | undefined {
  const debugIds = new Set(hits.map(hit => hit.debugId));
  return debugIds.size === 1 ? hits[0] : undefined;
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

  const hits: Hit[] = [];
  const consider = (images: ReadonlyArray<RegisteredWasmImage>, worker: boolean): void => {
    images.forEach((image, index) => {
      if (imageMatchesSyntheticName(image, name)) {
        hits.push({ index, worker, codeFile: image.code_file, debugId: image.debug_id });
      }
    });
  };
  consider(pageImages, false);
  consider(workerImages, true);
  const hit = uniqueHitByDebugId(hits);
  if (!hit) {
    return undefined;
  }
  return { index: hit.index, worker: hit.worker, codeFile: hit.codeFile };
}
