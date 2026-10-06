window.getEvent = async () => {
  function crash() {
    throw new Error('whoops');
  }

  const response = await fetch('https://localhost:5887/named.wasm');
  const buffer = await response.arrayBuffer();
  const { instance } = await WebAssembly.instantiate(new Uint8Array(buffer), {
    env: {
      external_func: crash,
    },
  });

  try {
    instance.exports.internal_func();
  } catch (err) {
    Sentry.captureException(err);
    return window.events.pop();
  }
};
