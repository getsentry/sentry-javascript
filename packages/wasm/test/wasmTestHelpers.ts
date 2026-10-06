import { _resetResponsePatchForTests } from '../src/patchWasmResponse';
import { _resetNonStreamingPatchForTests } from '../src/patchWebAssembly';

export type SavedWasmGlobals = {
  instantiate: typeof WebAssembly.instantiate;
  compile: typeof WebAssembly.compile;
  instantiateStreaming?: typeof WebAssembly.instantiateStreaming;
  compileStreaming?: typeof WebAssembly.compileStreaming;
  arrayBuffer: typeof Response.prototype.arrayBuffer;
  bytes?: typeof Response.prototype.bytes;
};

export function saveWasmGlobals(): SavedWasmGlobals {
  return {
    instantiate: WebAssembly.instantiate,
    compile: WebAssembly.compile,
    instantiateStreaming: WebAssembly.instantiateStreaming,
    compileStreaming: WebAssembly.compileStreaming,
    arrayBuffer: Response.prototype.arrayBuffer,
    bytes: 'bytes' in Response.prototype ? Response.prototype.bytes : undefined,
  };
}

export function restoreWasmGlobals(saved: SavedWasmGlobals): void {
  WebAssembly.instantiate = saved.instantiate;
  WebAssembly.compile = saved.compile;
  if (saved.instantiateStreaming) {
    WebAssembly.instantiateStreaming = saved.instantiateStreaming;
  }
  if (saved.compileStreaming) {
    WebAssembly.compileStreaming = saved.compileStreaming;
  }
  Response.prototype.arrayBuffer = saved.arrayBuffer;
  if (saved.bytes) {
    Response.prototype.bytes = saved.bytes;
  }
  _resetNonStreamingPatchForTests();
  _resetResponsePatchForTests();
}
