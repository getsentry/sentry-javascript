import type { DebugImage } from '@sentry/types';

export const IMAGES: Array<DebugImage> = [];

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

  if (buildIds.length > 0) {
    const firstBuildId = new Uint8Array(buildIds[0]);
    buildId = Array.from(firstBuildId).reduce((acc, x) => {
      return acc + x.toString(16).padStart(2, '0');
    }, '');
  }

  const externalDebugInfo = WebAssembly.Module.customSections(module, 'external_debug_info');
  if (externalDebugInfo.length > 0) {
    const firstExternalDebugInfo = new Uint8Array(externalDebugInfo[0]);
    const decoder = new TextDecoder('utf-8');
    debugFile = decoder.decode(firstExternalDebugInfo);
  }

  return { buildId, debugFile };
}

/**
 * Records a module
 */
export function registerModule(module: WebAssembly.Module, url: string): void {
  const { buildId, debugFile } = getModuleInfo(module);
  if (buildId) {
    const oldIdx = getImage(url);
    if (oldIdx >= 0) {
      IMAGES.splice(oldIdx, 1);
    }

    let debugFileUrl = null;
    if (debugFile) {
      try {
        debugFileUrl = new URL(debugFile, url).href;
      } catch {
        // debugFile could be a blob URL which causes the URL constructor to throw
        // for now we just ignore this case
      }
    }

    IMAGES.push({
      type: 'wasm',
      code_id: buildId,
      code_file: url,
      debug_file: debugFileUrl,
      debug_id: `${buildId.padEnd(32, '0').slice(0, 32)}0`,
    });
  }
}

/**
 * Returns all known images.
 */
export function getImages(): Array<DebugImage> {
  return IMAGES;
}

/**
 * Looks up an image by URL.
 *
 * @param url the URL of the WebAssembly module.
 */
export function getImage(url: string): number {
  return IMAGES.findIndex(image => {
    return image.type === 'wasm' && image.code_file === url;
  });
}
