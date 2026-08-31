import { getWasmSourceUrl, patchWasmResponseBodyReaders } from './patchWasmResponse';

export type RegisterModuleCallback = (module: WebAssembly.Module, url: string) => void;

let nonStreamingPatched = false;

/**
 * Patches the WebAssembly streaming APIs so that every compiled module gets
 * registered as a debug image under the URL of the response it was compiled
 * from.
 *
 * @param registerModule callback invoked for every successfully compiled module
 */
export function patchStreamingWebAssembly(registerModule: RegisterModuleCallback): void {
  if ('instantiateStreaming' in WebAssembly) {
    const origInstantiateStreaming = WebAssembly.instantiateStreaming as (
      response: unknown,
      ...rest: unknown[]
    ) => Promise<WebAssembly.WebAssemblyInstantiatedSource>;
    WebAssembly.instantiateStreaming = function instantiateStreaming(
      response: Response | PromiseLike<Response>,
      ...rest: unknown[]
    ): Promise<WebAssembly.WebAssemblyInstantiatedSource> {
      return Promise.resolve(response).then(response => {
        return origInstantiateStreaming(response, ...rest).then(rv => {
          if (response.url) {
            registerSafely(registerModule, rv.module, response.url);
          }
          return rv;
        });
      });
    };
  }

  if ('compileStreaming' in WebAssembly) {
    const origCompileStreaming = WebAssembly.compileStreaming as (
      source: unknown,
      ...rest: unknown[]
    ) => Promise<WebAssembly.Module>;
    WebAssembly.compileStreaming = function compileStreaming(
      source: Response | PromiseLike<Response>,
      ...rest: unknown[]
    ): Promise<WebAssembly.Module> {
      return Promise.resolve(source).then(response => {
        return origCompileStreaming(response, ...rest).then(module => {
          if (response.url) {
            registerSafely(registerModule, module, response.url);
          }
          return module;
        });
      });
    };
  }
}

function registerSafely(registerModule: RegisterModuleCallback, module: WebAssembly.Module, url: string): void {
  try {
    registerModule(module, url);
  } catch {
    // a registration failure must never break the user's WebAssembly call
  }
}

function registerFromBufferSource(
  registerModule: RegisterModuleCallback,
  module: WebAssembly.Module,
  source: BufferSource,
): void {
  const url = getWasmSourceUrl(source);
  if (url) {
    registerSafely(registerModule, module, url);
  }
}

/**
 * Patches the non-streaming web assembly runtime.
 */
function patchNonStreamingWebAssembly(registerModule: RegisterModuleCallback): void {
  if (nonStreamingPatched) {
    return;
  }

  nonStreamingPatched = true;

  // Double-cast, because the overloaded native signature (buffer vs. module
  // first argument) cannot be widened to a pass-through shape in one step.
  const origInstantiate = WebAssembly.instantiate as unknown as (
    source: unknown,
    ...rest: unknown[]
  ) => Promise<WebAssembly.WebAssemblyInstantiatedSource>;
  WebAssembly.instantiate = function instantiate(source: BufferSource | WebAssembly.Module, ...rest: unknown[]) {
    if (source instanceof WebAssembly.Module) {
      return origInstantiate(source, ...rest);
    }

    return origInstantiate(source, ...rest).then(result => {
      registerFromBufferSource(registerModule, result.module, source);
      return result;
    });
  } as typeof WebAssembly.instantiate;

  const origCompile = WebAssembly.compile as (source: unknown, ...rest: unknown[]) => Promise<WebAssembly.Module>;
  WebAssembly.compile = function compile(source: BufferSource, ...rest: unknown[]): Promise<WebAssembly.Module> {
    return origCompile(source, ...rest).then(module => {
      registerFromBufferSource(registerModule, module, source);
      return module;
    });
  };
}

/**
 * Patches the web assembly runtime.
 */
export function patchWebAssembly(registerModule: RegisterModuleCallback): void {
  patchWasmResponseBodyReaders();
  patchNonStreamingWebAssembly(registerModule);
  patchStreamingWebAssembly(registerModule);
}

/** @internal */
export function _resetNonStreamingPatchForTests(): void {
  nonStreamingPatched = false;
}
