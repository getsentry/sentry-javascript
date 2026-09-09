import { getWasmSourceUrl, patchWasmResponseBodyReaders } from './patchWasmResponse';

export type RegisterModuleCallback = (module: WebAssembly.Module, url: string) => void;

/**
 * Patches the WebAssembly streaming APIs so that every compiled module gets
 * registered as a debug image under the URL of the response it was compiled
 * from.
 *
 * @param registerModule callback invoked for every successfully compiled module
 */
function patchStreamingWebAssembly(registerModule: RegisterModuleCallback): void {
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

/**
 * Registers a module compiled from bytes under the URL those bytes were fetched from, when known.
 * Runs inside the caller's promise chain, so nothing in here may throw.
 */
function registerFromBufferSource(
  registerModule: RegisterModuleCallback,
  compiled: WebAssembly.Module | WebAssembly.WebAssemblyInstantiatedSource | WebAssembly.Instance,
  source: unknown,
): void {
  try {
    // `instantiate(module)` resolves to a bare Instance, which carries nothing new to register
    const module =
      compiled instanceof WebAssembly.Module ? compiled : 'module' in compiled ? compiled.module : undefined;
    const url = getWasmSourceUrl(source);
    if (module && url) {
      registerModule(module, url);
    }
  } catch {
    // a registration failure must never break the user's WebAssembly call
  }
}

/**
 * Patches the non-streaming web assembly runtime.
 */
function patchNonStreamingWebAssembly(registerModule: RegisterModuleCallback): void {
  // Double-cast, because the overloaded native signature (buffer vs. module
  // first argument) cannot be widened to a pass-through shape in one step.
  const origInstantiate = WebAssembly.instantiate as unknown as (
    source: unknown,
    ...rest: unknown[]
  ) => Promise<WebAssembly.WebAssemblyInstantiatedSource | WebAssembly.Instance>;
  WebAssembly.instantiate = function instantiate(source: unknown, ...rest: unknown[]) {
    return origInstantiate(source, ...rest).then(result => {
      registerFromBufferSource(registerModule, result, source);
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
 *
 * Failures are swallowed in two distinct phases. At install time `tryPatch` isolates each patch, so
 * a missing or frozen global neither throws out of `Sentry.init()` / `registerWebWorkerWasm()` nor
 * keeps the remaining patches from installing. At call time `registerSafely`,
 * `registerFromBufferSource` and `tagResponseSource` run inside the caller's own promise chain,
 * where a throw would reject the user's `WebAssembly` call or an unrelated response body read.
 *
 * Callers are expected to patch once per realm: `wasmIntegration` runs from `setupOnce`, which core
 * invokes a single time, and `registerWebWorkerWasm` is a one-shot call inside a worker.
 */
export function patchWebAssembly(registerModule: RegisterModuleCallback): void {
  tryPatch(() => patchWasmResponseBodyReaders());
  tryPatch(() => patchNonStreamingWebAssembly(registerModule));
  tryPatch(() => patchStreamingWebAssembly(registerModule));
}

function tryPatch(patch: () => void): void {
  try {
    patch();
  } catch {
    // see patchWebAssembly()
  }
}
