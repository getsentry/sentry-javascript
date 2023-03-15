window.events = [];

window.getEvent = async () => {
  function crash() {
    throw new Error('whoops');
  }

  const { instance } = await WebAssembly.instantiateStreaming(fetch('https://localhost:5887/simple.wasm'), {
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
