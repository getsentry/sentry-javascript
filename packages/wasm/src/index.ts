import type { DebugImage, Event, IntegrationFn, StackFrame } from '@sentry/core';
import { defineIntegration, GLOBAL_OBJ } from '@sentry/core';
import { patchWebAssembly } from './patchWebAssembly';
import type { WasmDebugImage } from './registry';
import { getImage, getImages, registerModule } from './registry';

const INTEGRATION_NAME = 'Wasm';

// We use the same prefix as bundler plugins so that thirdPartyErrorFilterIntegration
// recognizes WASM frames as first-party code without needing modifications.
const BUNDLER_PLUGIN_APP_KEY_PREFIX = '_sentryBundlerPluginAppKey:';

/**
 * Minimal interface for DedicatedWorkerGlobalScope.
 * We can't use the actual type because it breaks everyone who doesn't have {"lib": ["WebWorker"]}
 */
interface MinimalDedicatedWorkerGlobalScope {
  postMessage: (message: unknown) => void;
}

interface RegisterWebWorkerWasmOptions {
  self: MinimalDedicatedWorkerGlobalScope;
}

interface WasmIntegrationOptions {
  /**
   * Key to identify this application for third-party error filtering.
   * This key should match one of the keys provided to the `filterKeys` option
   * of the `thirdPartyErrorFilterIntegration`.
   */
  applicationKey?: string;
}

// Access WINDOW with proper typing for _sentryWasmImages
const WINDOW = GLOBAL_OBJ as typeof GLOBAL_OBJ & {
  _sentryWasmImages?: Array<WasmDebugImage>;
};

const _wasmIntegration = ((options: WasmIntegrationOptions = {}) => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      patchWebAssembly(registerModule);
    },
    processEvent(event: Event): Event {
      let hasAtLeastOneWasmFrameWithImage = false;

      const existingImagesCount = event.debug_meta?.images?.length || 0;

      if (event.exception?.values) {
        event.exception.values.forEach(exception => {
          if (exception.stacktrace?.frames) {
            hasAtLeastOneWasmFrameWithImage =
              patchFrames(exception.stacktrace.frames, options.applicationKey, existingImagesCount) ||
              hasAtLeastOneWasmFrameWithImage;
          }
        });
      }

      if (hasAtLeastOneWasmFrameWithImage) {
        event.debug_meta = event.debug_meta || {};
        const mainThreadImages = getImages();
        const workerImages = getWorkerImages();
        event.debug_meta.images = [
          ...(event.debug_meta.images || []),
          ...mainThreadImages.map(stripInternalFields),
          ...workerImages.map(stripInternalFields),
        ];
      }

      return event;
    },
  };
}) satisfies IntegrationFn;

export const wasmIntegration = defineIntegration(_wasmIntegration);

const PARSER_REGEX = /^(.*?):wasm-function\[\d+\]:(0x[a-fA-F0-9]+)$/;

/**
 * Patches a list of stackframes with wasm data needed for server-side symbolication
 * if applicable. Returns true if the provided list of stack frames had at least one
 * matching registered image.
 *
 * @param frames - Stack frames to patch
 * @param applicationKey - Optional key for third-party error filtering
 * @param existingImagesOffset - Number of existing debug images that will be prepended
 *                               to the final images array (used to calculate correct addr_mode indices)
 */
// Only exported for tests
export function patchFrames(
  frames: Array<StackFrame>,
  applicationKey?: string,
  existingImagesOffset: number = 0,
): boolean {
  let hasAtLeastOneWasmFrameWithImage = false;
  frames.forEach(frame => {
    if (!frame.filename) {
      return;
    }

    const split = frame.filename.split('(');
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const lastSplit = split[split.length - 1]!;

    // Let's call this first match a "messy match".
    // The browser stacktrace parser spits out frames that have a filename like this: "int) const (http://localhost:8001/main.wasm:wasm-function[190]:0x5aeb"
    // It contains some leftover mess because wasm stack frames are more complicated than our parser can handle: "at MyClass::bar(int) const (http://localhost:8001/main.wasm:wasm-function[190]:0x5aeb)"
    // This first match simply tries to mitigate the mess up until the first opening parens.
    // The match afterwards is a sensible fallback
    let match = lastSplit.match(PARSER_REGEX) as null | [string, string, string];

    if (!match) {
      match = frame.filename.match(PARSER_REGEX) as null | [string, string, string];
    }

    if (match) {
      const index = getImage(match[1]);
      const workerImageIndex = getWorkerImage(match[1]);
      frame.instruction_addr = match[2];
      frame.filename = match[1];
      frame.platform = 'native';

      if (applicationKey) {
        frame.module_metadata = {
          ...frame.module_metadata,
          [`${BUNDLER_PLUGIN_APP_KEY_PREFIX}${applicationKey}`]: true,
        };
      }

      if (index >= 0) {
        frame.addr_mode = `rel:${existingImagesOffset + index}`;
        hasAtLeastOneWasmFrameWithImage = true;
      } else if (workerImageIndex >= 0) {
        const mainThreadImagesCount = getImages().length;
        frame.addr_mode = `rel:${existingImagesOffset + mainThreadImagesCount + workerImageIndex}`;
        hasAtLeastOneWasmFrameWithImage = true;
      } else if (isEngineNamedWasmFilename(match[1])) {
        // The engine names modules that were compiled from raw bytes itself:
        // V8 hashes the content of modules below its hashing cutoff, Firefox
        // derives the name from the compile call site. Neither can be
        // predicted at registration time. If exactly one distinct module was
        // registered from raw bytes, the frame can only belong to it.
        const fallbackIndex = getSingleBufferImageIndex();
        if (fallbackIndex >= 0) {
          frame.addr_mode = `rel:${existingImagesOffset + fallbackIndex}`;
          hasAtLeastOneWasmFrameWithImage = true;
        }
      }
    }
  });

  return hasAtLeastOneWasmFrameWithImage;
}

function getWorkerImages(): Array<WasmDebugImage> {
  return WINDOW._sentryWasmImages || [];
}

function stripInternalFields(image: WasmDebugImage): DebugImage {
  const { _fromBuffer, ...rest } = image;
  return rest;
}

/**
 * Looks up an image by URL in worker images.
 */
function getWorkerImage(url: string): number {
  return getWorkerImages().findIndex(image => image.type === 'wasm' && image.code_file === url);
}

function isEngineNamedWasmFilename(filename: string): boolean {
  return filename.startsWith('wasm://') || filename.includes('> WebAssembly.');
}

/**
 * Returns the index (across main-thread and worker images) of the only
 * distinct image that was registered from raw bytes, or -1 if there is none
 * or more than one. The same module registered on several threads counts
 * once, since the images share their build id.
 */
function getSingleBufferImageIndex(): number {
  const mainImages = getImages();
  const workerImages = getWorkerImages();
  let index = -1;
  const buildIds = new Set<string>();
  const collect = (image: WasmDebugImage, imageIndex: number): void => {
    const buildId = image.code_id;
    if (image._fromBuffer && buildId && !buildIds.has(buildId)) {
      buildIds.add(buildId);
      index = imageIndex;
    }
  };
  mainImages.forEach((image, i) => collect(image, i));
  workerImages.forEach((image, i) => collect(image, mainImages.length + i));
  return buildIds.size === 1 ? index : -1;
}

/**
 * Use this function to register WASM support in a web worker.
 *
 * This function will:
 * - Patch the WebAssembly compilation APIs in the worker
 * - Forward WASM debug images to the parent thread for symbolication
 *
 * @param options {RegisterWebWorkerWasmOptions} Options:
 *   - `self`: The worker's global scope (self).
 */
export function registerWebWorkerWasm({ self }: RegisterWebWorkerWasmOptions): void {
  patchWebAssembly((module, url, fromBuffer) => {
    const image = registerModule(module, url, fromBuffer);

    if (image) {
      self.postMessage({
        _sentryMessage: true,
        _sentryWasmImages: [image],
      });
    }
  });
}
