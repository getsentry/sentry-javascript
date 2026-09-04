import type { DebugImage } from '@sentry/core';
import { parseNameSectionModuleName } from './wasmNameSection';

export type RegisteredWasmImage = Extract<DebugImage, { type: 'wasm' }> & {
  /** Internal: wasm `name` section. Used to link `wasm://` stacks; stripped before the event is sent. */
  moduleName?: string;
};

export const IMAGES: Array<RegisteredWasmImage> = [];

export interface ModuleInfo {
  buildId: string | null;
  debugFile: string | null;
  moduleName: string | null;
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

  let moduleName = null;
  try {
    const nameSections = WebAssembly.Module.customSections(module, 'name');
    const nameSection0 = nameSections[0];
    if (nameSection0) {
      moduleName = parseNameSectionModuleName(nameSection0);
    }
  } catch {
    moduleName = null;
  }

  return { buildId, debugFile, moduleName };
}

/**
 * Records a module and returns the created debug image.
 */
export function registerModule(module: WebAssembly.Module, url: string): RegisteredWasmImage | null {
  const { buildId, debugFile, moduleName } = getModuleInfo(module);
  if (!buildId) {
    return null;
  }

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

  const image: RegisteredWasmImage = {
    type: 'wasm',
    code_id: buildId,
    code_file: url,
    debug_file: debugFileUrl,
    debug_id: `${buildId.padEnd(32, '0').slice(0, 32)}0`,
  };
  if (moduleName) {
    image.moduleName = moduleName;
  }

  IMAGES.push(image);
  return image;
}

/**
 * Returns all known images.
 */
export function getImages(): Array<RegisteredWasmImage> {
  return IMAGES;
}

/**
 * Debug image payload for Sentry: protocol fields only (no internal `moduleName`).
 */
export function toProtocolDebugImage(image: RegisteredWasmImage): DebugImage {
  const { moduleName: _moduleName, ...protocol } = image;
  return protocol;
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
