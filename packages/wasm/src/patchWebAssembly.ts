import { registerModule } from './registry';

/**
 * Patches the web assembly runtime.
 */
export function patchWebAssembly() {
  const origInstantiateStreaming = WebAssembly.instantiateStreaming;
  const origCompileStreaming = WebAssembly.compileStreaming;

  function recordedInstanticateStreaming(promise: Promise<any>, obj: any) {
    return Promise.resolve(promise).then(resp => {
      return origInstantiateStreaming(resp, obj).then(rv => {
        if (resp.url) {
          registerModule(rv.module, resp.url);
        }
        return rv;
      });
    });
  }

  function recordedCompileStreaming(promise: Promise<any>) {
    return Promise.resolve(promise).then(resp => {
      return origCompileStreaming(resp).then(module => {
        if (resp.url) {
          registerModule(module, resp.url);
        }
        return module;
      });
    });
  }

  (WebAssembly as any).instantiateStreaming = recordedInstanticateStreaming;
  (WebAssembly as any).compileStreaming = recordedCompileStreaming;
}
