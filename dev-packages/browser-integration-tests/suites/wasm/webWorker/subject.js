window.events = [];

window.triggerWasmError = () => {
  window.wasmWorker.postMessage({
    type: 'load-wasm-and-crash',
    wasmUrl: 'https://localhost:5887/simple.wasm',
  });
};
