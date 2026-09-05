import { getSyntheticUrl, toByteView } from './syntheticUrl';

export type RegisterModuleCallback = (module: WebAssembly.Module, url: string, fromBuffer?: boolean) => void;

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

  const registerFromBuffer = (module: WebAssembly.Module, byteLength: number): void => {
    registerSafely(registerModule, module, getSyntheticUrl(module, byteLength), true);
  };

  // Double-cast, because the overloaded native signature (buffer vs. module
  // first argument) cannot be widened to a pass-through shape in one step.
  const origInstantiate = WebAssembly.instantiate as unknown as (
    source: unknown,
    ...rest: unknown[]
  ) => Promise<WebAssembly.WebAssemblyInstantiatedSource>;
  WebAssembly.instantiate = function instantiate(source: unknown, ...rest: unknown[]): Promise<unknown> {
    const bytes = toByteView(source);
    // The length must be read before calling the original function, since the
    // caller is free to mutate or transfer the buffer afterwards.
    const byteLength = bytes?.byteLength;
    const result = origInstantiate(source, ...rest);
    if (byteLength !== undefined) {
      // Chaining (instead of attaching a side listener) keeps rejections of
      // fire-and-forget calls observable as unhandledrejection events.
      return result.then(rv => {
        registerFromBuffer(rv.module, byteLength);
        return rv;
      });
    }
    return result;
  } as typeof WebAssembly.instantiate;

  const origCompile = WebAssembly.compile as (source: unknown, ...rest: unknown[]) => Promise<WebAssembly.Module>;
  WebAssembly.compile = function compile(source: unknown, ...rest: unknown[]): Promise<WebAssembly.Module> {
    const bytes = toByteView(source);
    const byteLength = bytes?.byteLength;
    const result = origCompile(source, ...rest);
    if (byteLength !== undefined) {
      return result.then(module => {
        registerFromBuffer(module, byteLength);
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
      const byteLength = toByteView(args[0])?.byteLength;
      const module = Reflect.construct(target, args, newTarget) as WebAssembly.Module;
      if (byteLength !== undefined) {
        registerFromBuffer(module, byteLength);
      }
      return module;
    },
  });
}

function registerSafely(
  registerModule: RegisterModuleCallback,
  module: WebAssembly.Module,
  url: string,
  fromBuffer?: boolean,
): void {
  try {
    registerModule(module, url, fromBuffer);
  } catch {
    // a registration failure must never break the user's WebAssembly call
  }
}
