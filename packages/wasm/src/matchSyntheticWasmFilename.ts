import type { DebugImage } from '@sentry/core';
import type { RegisteredWasmImage } from './registry';

/**
 * Maps Chrome `wasm://wasm/<name>-<hash>` frames to a registered `code_file`.
 *
 * Prefer the wasm `name` section (`moduleName`). If that section is missing or
 * does not match the stack label, guess from the fetch URL basename (including
 * wasm-bindgen `_bg.wasm` → `.wasm`). Hits are accepted only when every
 * candidate shares one `debug_id`.
 *
 * Hash-only `wasm://wasm/<id>` is not mapped (see #23781).
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
 * Chrome's module label without the `wasm://wasm/` prefix or trailing isolate hash.
 * `wasm://wasm/demo.wasm-000197f6` → `demo.wasm`. Hash-only `wasm://wasm/0bee4c4e` → `0bee4c4e`.
 */
export function syntheticModuleName(filename: string): string | undefined {
  const body = filename.match(/^wasm:\/\/wasm\/(.+)$/i)?.[1];
  if (!body) {
    return undefined;
  }
  return body.replace(/-[0-9a-fA-F]{6,16}$/, '');
}

/**
 * Fetch filename plus known packaging aliases.
 *
 * wasm-bindgen writes `foo_bg.wasm` next to `foo.js` but the stack label is often
 * `foo.wasm`. Used when the name section is missing or does not match.
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

export function registeredWasmMatchesSyntheticName(codeFile: string, syntheticName: string): boolean {
  return namesForRegisteredWasm(codeFile).includes(syntheticName);
}

function wasmNameSectionName(image: DebugImage): string | undefined {
  const moduleName = (image as RegisteredWasmImage).moduleName;
  return typeof moduleName === 'string' && moduleName.length > 0 ? moduleName : undefined;
}

export function imageMatchesSyntheticName(image: DebugImage, syntheticName: string): boolean {
  if (wasmNameSectionName(image) === syntheticName) {
    return true;
  }
  return typeof image.code_file === 'string' && registeredWasmMatchesSyntheticName(image.code_file, syntheticName);
}

/**
 * Multiple URLs may register the same binary. Only use a hit when every candidate
 * shares one `debug_id`. Different binaries with the same name stay unmatched.
 */
export function uniqueHitByDebugId<T extends { debugId: string }>(hits: T[]): T | undefined {
  const debugIds = new Set(hits.map(hit => hit.debugId));
  return debugIds.size === 1 ? hits[0] : undefined;
}

/**
 * Chrome's isolate hash is not a debug_id and is not on `WebAssembly.Module`.
 * `wasm://wasm/<hex>` with no module name must not pick an image (see #23781).
 */
function isHashOnlySyntheticName(name: string): boolean {
  return /^[0-9a-fA-F]{6,16}$/.test(name);
}

export function uniqueImageForSyntheticFilename(
  filename: string,
  pageImages: ReadonlyArray<DebugImage>,
  workerImages: ReadonlyArray<DebugImage>,
): SyntheticWasmImageHit | undefined {
  const name = syntheticModuleName(filename);
  if (!name || isHashOnlySyntheticName(name)) {
    return undefined;
  }

  const hits: Hit[] = [];
  const consider = (images: ReadonlyArray<DebugImage>, worker: boolean): void => {
    images.forEach((image, index) => {
      if (image.type === 'wasm' && typeof image.code_file === 'string' && imageMatchesSyntheticName(image, name)) {
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
