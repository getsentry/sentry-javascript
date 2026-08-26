import { getHashCandidates, getSyntheticUrls, toByteView } from './syntheticUrl';

export type RegisterModuleCallback = (module: WebAssembly.Module, url: string, matchUrls?: string[]) => void;

/**
 * Patches the WebAssembly APIs that compile modules so that every compiled
 * module gets registered as a debug image.
 *
 * Streaming APIs register the module under the response URL. Non-streaming
 * APIs receive raw bytes without any URL, so those modules are registered
 * under the synthetic `wasm://wasm/<hash>` script name the engine uses in
 * stack frames (see `syntheticUrl.ts`).
 *
 * @param registerModule callback invoked for every successfully compiled module
 */
export function patchWebAssembly(registerModule: RegisterModuleCallback): void {
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

  const registerFromBuffer = (module: WebAssembly.Module, hashCandidates: string[]): void => {
    const urls = getSyntheticUrls(module, hashCandidates);
    const url = urls[0];
    if (url) {
      registerSafely(registerModule, module, url, urls);
    }
  };

  // Double-cast, because the overloaded native signature (buffer vs. module
  // first argument) cannot be widened to a pass-through shape in one step.
  const origInstantiate = WebAssembly.instantiate as unknown as (
    source: unknown,
    ...rest: unknown[]
  ) => Promise<WebAssembly.WebAssemblyInstantiatedSource>;
  WebAssembly.instantiate = function instantiate(source: unknown, ...rest: unknown[]): Promise<unknown> {
    const bytes = toByteView(source);
    // Hash candidates must be captured before calling the original function,
    // since the caller is free to mutate or transfer the buffer afterwards.
    const hashCandidates = bytes && getHashCandidates(bytes);
    const result = origInstantiate(source, ...rest);
    if (hashCandidates) {
      // Chaining (instead of attaching a side listener) keeps rejections of
      // fire-and-forget calls observable as unhandledrejection events.
      return result.then(rv => {
        registerFromBuffer(rv.module, hashCandidates);
        return rv;
      });
    }
    return result;
  } as typeof WebAssembly.instantiate;

  const origCompile = WebAssembly.compile as (source: unknown, ...rest: unknown[]) => Promise<WebAssembly.Module>;
  WebAssembly.compile = function compile(source: unknown, ...rest: unknown[]): Promise<WebAssembly.Module> {
    const bytes = toByteView(source);
    const hashCandidates = bytes && getHashCandidates(bytes);
    const result = origCompile(source, ...rest);
    if (hashCandidates) {
      return result.then(module => {
        registerFromBuffer(module, hashCandidates);
        return module;
      });
    }
    return result;
  };

  // `new WebAssembly.Module(bytes)` compiles synchronously. The Proxy keeps
  // statics (customSections, exports, imports), prototype, and instanceof
  // behavior intact.
  WebAssembly.Module = new Proxy(WebAssembly.Module, {
    construct(target, args: unknown[], newTarget) {
      const bytes = toByteView(args[0]);
      const hashCandidates = bytes && getHashCandidates(bytes);
      const module = Reflect.construct(target, args, newTarget) as WebAssembly.Module;
      if (hashCandidates) {
        registerFromBuffer(module, hashCandidates);
      }
      return module;
    },
  });
}

function registerSafely(
  registerModule: RegisterModuleCallback,
  module: WebAssembly.Module,
  url: string,
  matchUrls?: string[],
): void {
  try {
    registerModule(module, url, matchUrls);
  } catch {
    // a registration failure must never break the user's WebAssembly call
  }
}
