window.events = [];

window.triggerWasmError = () => {
  window.wasmWorker.postMessage({
    type: 'load-wasm-and-crash',
    wasmUrl: 'https://localhost:5887/simple.wasm',
  });
};

window.triggerWasmBufferError = () => {
  window.wasmWorker.postMessage({
    type: 'load-wasm-bytes-and-crash',
    wasmUrl: 'https://localhost:5887/named.wasm',
  });
};
