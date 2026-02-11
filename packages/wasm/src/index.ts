import type { DebugImage, Event, IntegrationFn, StackFrame } from '@sentry/core';
import { defineIntegration, GLOBAL_OBJ } from '@sentry/core';
import { patchWebAssembly } from './patchWebAssembly';
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
  _sentryWasmImages?: Array<DebugImage>;
};

const _wasmIntegration = ((options: WasmIntegrationOptions = {}) => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      patchWebAssembly();
    },
    processEvent(event: Event): Event {
      let hasAtLeastOneWasmFrameWithImage = false;

      const existingImagesCount = event.debug_meta?.images?.length || 0;

      if (event.exception?.values) {
        event.exception.values.forEach(exception => {
          if (exception.stacktrace?.frames) {
            hasAtLeastOneWasmFrameWithImage =
              hasAtLeastOneWasmFrameWithImage ||
              patchFrames(exception.stacktrace.frames, options.applicationKey, existingImagesCount);
          }
        });
      }

      if (hasAtLeastOneWasmFrameWithImage) {
        event.debug_meta = event.debug_meta || {};
        const mainThreadImages = getImages();
        const workerImages = WINDOW._sentryWasmImages || [];
        event.debug_meta.images = [...(event.debug_meta.images || []), ...mainThreadImages, ...workerImages];
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
      }
    }
  });

  return hasAtLeastOneWasmFrameWithImage;
}

/**
 * Looks up an image by URL in worker images.
 */
function getWorkerImage(url: string): number {
  const workerImages = WINDOW._sentryWasmImages || [];
  return workerImages.findIndex(image => {
    return image.type === 'wasm' && image.code_file === url;
  });
}

/**
 * Use this function to register WASM support in a web worker.
 *
 * This function will:
 * - Patch WebAssembly.instantiateStreaming and WebAssembly.compileStreaming in the worker
 * - Forward WASM debug images to the parent thread for symbolication
 *
 * @param options {RegisterWebWorkerWasmOptions} Options:
 *   - `self`: The worker's global scope (self).
 */
export function registerWebWorkerWasm({ self }: RegisterWebWorkerWasmOptions): void {
  patchWebAssemblyWithForwarding(self);
}

/**
 * Patches the WebAssembly object in the worker scope and forwards
 * registered modules to the parent thread.
 */
function patchWebAssemblyWithForwarding(workerSelf: MinimalDedicatedWorkerGlobalScope): void {
  if ('instantiateStreaming' in WebAssembly) {
    const origInstantiateStreaming = WebAssembly.instantiateStreaming;
    WebAssembly.instantiateStreaming = function instantiateStreaming(
      response: Response | PromiseLike<Response>,
      importObject: WebAssembly.Imports,
    ): Promise<WebAssembly.Module> {
      return Promise.resolve(response).then(response => {
        return origInstantiateStreaming(response, importObject).then(rv => {
          if (response.url) {
            registerModuleAndForward(rv.module, response.url, workerSelf);
          }
          return rv;
        });
      });
    } as typeof WebAssembly.instantiateStreaming;
  }

  if ('compileStreaming' in WebAssembly) {
    const origCompileStreaming = WebAssembly.compileStreaming;
    WebAssembly.compileStreaming = function compileStreaming(
      source: Response | Promise<Response>,
    ): Promise<WebAssembly.Module> {
      return Promise.resolve(source).then(response => {
        return origCompileStreaming(response).then(module => {
          if (response.url) {
            registerModuleAndForward(module, response.url, workerSelf);
          }
          return module;
        });
      });
    } as typeof WebAssembly.compileStreaming;
  }
}

/**
 * Registers a WASM module and forwards its debug image to the parent thread.
 */
function registerModuleAndForward(
  module: WebAssembly.Module,
  url: string,
  workerSelf: MinimalDedicatedWorkerGlobalScope,
): void {
  const image = registerModule(module, url);

  if (image) {
    workerSelf.postMessage({
      _sentryMessage: true,
      _sentryWasmImages: [image],
    });
  }
}
