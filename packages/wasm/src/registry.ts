import type { DebugImage } from '@sentry/core';

/**
 * A debug image with the additional synthetic script names the engine may use
 * for the module in stack frames. Only set for modules compiled from raw
 * bytes. The field crosses worker boundaries via postMessage and is stripped
 * before images are attached to an event.
 */
export type WasmDebugImage = Extract<DebugImage, { type: 'wasm' }> & { _matchUrls?: string[] };

export const IMAGES: Array<WasmDebugImage> = [];

export interface ModuleInfo {
  buildId: string | null;
  debugFile: string | null;
}

/**
 * Returns the extracted meta information from a web assembly module that
 * Sentry uses to identify debug images.
 *
 * @param module
 */
export function getModuleInfo(module: WebAssembly.Module): ModuleInfo {
  const buildIds = WebAssembly.Module.customSections(module, 'build_id');
  let buildId = null;
  let debugFile = null;

  const buildId0 = buildIds[0];
  if (buildId0) {
    const firstBuildId = new Uint8Array(buildId0);
    buildId = Array.from(firstBuildId).reduce((acc, x) => {
      return acc + x.toString(16).padStart(2, '0');
    }, '');
  }

  const externalDebugInfo = WebAssembly.Module.customSections(module, 'external_debug_info');
  const externalDebugInfo0 = externalDebugInfo[0];
  if (externalDebugInfo0) {
    const firstExternalDebugInfo = new Uint8Array(externalDebugInfo0);
    const decoder = new TextDecoder('utf-8');
    debugFile = decoder.decode(firstExternalDebugInfo);
  }

  return { buildId, debugFile };
}

/**
 * Records a module and returns the created debug image.
 *
 * @param module the compiled module
 * @param url the URL the module was loaded from, or the engine's synthetic
 *            script name for modules compiled from raw bytes
 * @param matchUrls additional synthetic script names the engine may use for
 *                  this module in stack frames
 */
export function registerModule(module: WebAssembly.Module, url: string, matchUrls?: string[]): DebugImage | null {
  const { buildId, debugFile } = getModuleInfo(module);
  if (!buildId) {
    return null;
  }

  const oldIdx = getImage(url);
  if (oldIdx >= 0) {
    IMAGES.splice(oldIdx, 1);
  }

  let debugFileUrl = null;
  if (debugFile) {
    if (url.startsWith('wasm://')) {
      // A synthetic script name is no meaningful base to resolve against, so
      // keep the raw value from the external_debug_info section.
      debugFileUrl = debugFile;
    } else {
      try {
        debugFileUrl = new URL(debugFile, url).href;
      } catch {
        // debugFile could be a blob URL which causes the URL constructor to throw
        // for now we just ignore this case
      }
    }
  }

  const image: WasmDebugImage = {
    type: 'wasm',
    code_id: buildId,
    code_file: url,
    debug_file: debugFileUrl,
    debug_id: `${buildId.padEnd(32, '0').slice(0, 32)}0`,
  };

  if (matchUrls?.length) {
    image._matchUrls = matchUrls;
  }

  IMAGES.push(image);
  return image;
}

/**
 * Returns all known images.
 */
export function getImages(): Array<WasmDebugImage> {
  return IMAGES;
}

/**
 * Checks whether an image matches the given frame URL, either via its
 * `code_file` or one of the synthetic script names.
 */
export function imageMatchesUrl(image: WasmDebugImage, url: string): boolean {
  return image.type === 'wasm' && (image.code_file === url || !!image._matchUrls?.includes(url));
}

/**
 * Looks up an image by URL.
 *
 * @param url the URL of the WebAssembly module.
 */
export function getImage(url: string): number {
  return IMAGES.findIndex(image => imageMatchesUrl(image, url));
}
