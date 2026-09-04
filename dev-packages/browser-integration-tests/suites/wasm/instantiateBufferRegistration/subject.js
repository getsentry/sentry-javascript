window.loadWasmFromBuffer = async () => {
  const response = await fetch('https://localhost:5887/simple.wasm');
  const buffer = await response.arrayBuffer();

  await WebAssembly.instantiate(new Uint8Array(buffer), {
    env: {
      external_func: () => {},
    },
  });

  return window.registeredImages;
};
