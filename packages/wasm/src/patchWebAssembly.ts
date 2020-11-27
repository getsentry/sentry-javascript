import { registerModule } from './registry';

/**
 * Patches the web assembly runtime.
 */
export function patchWebAssembly(): void {
  if ('instantiateStreaming' in WebAssembly) {
    const origInstantiateStreaming = WebAssembly.instantiateStreaming;
    WebAssembly.instantiateStreaming = function instantiateStreaming(
      response: Response | PromiseLike<Response>,
      importObject: WebAssembly.Imports,
    ): Promise<WebAssembly.Module> {
      return Promise.resolve(response).then(response => {
        return origInstantiateStreaming(response, importObject).then(rv => {
          if (response.url) {
            registerModule(rv.module, response.url);
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
            registerModule(module, response.url);
          }
          return module;
        });
      });
    } as typeof WebAssembly.compileStreaming;
  }
}
