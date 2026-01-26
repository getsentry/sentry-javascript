// Simulate what the bundler plugin would inject to mark this JS file as first-party
var _sentryModuleMetadataGlobal =
  typeof window !== 'undefined'
    ? window
    : typeof global !== 'undefined'
      ? global
      : typeof self !== 'undefined'
        ? self
        : {};

_sentryModuleMetadataGlobal._sentryModuleMetadata = _sentryModuleMetadataGlobal._sentryModuleMetadata || {};

_sentryModuleMetadataGlobal._sentryModuleMetadata[new Error().stack] = Object.assign(
  {},
  _sentryModuleMetadataGlobal._sentryModuleMetadata[new Error().stack],
  {
    '_sentryBundlerPluginAppKey:wasm-test-app': true,
  },
);

async function runWasm() {
  function crash() {
    throw new Error('WASM triggered error');
  }

  const { instance } = await WebAssembly.instantiateStreaming(fetch('https://localhost:5887/simple.wasm'), {
    env: {
      external_func: crash,
    },
  });

  instance.exports.internal_func();
}

runWasm();
