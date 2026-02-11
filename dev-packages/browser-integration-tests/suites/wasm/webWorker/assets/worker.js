// This worker manually replicates what Sentry.registerWebWorkerWasm() does.
// the reason for manual replication is that it allows us to test the message-passing protocol
//  between worker and main thread independent of SDK implementation details
// in production code you would do: registerWebWorkerWasm({ self });

const origInstantiateStreaming = WebAssembly.instantiateStreaming;
WebAssembly.instantiateStreaming = function instantiateStreaming(response, importObject) {
  return Promise.resolve(response).then(res => {
    return origInstantiateStreaming(res, importObject).then(rv => {
      if (res.url) {
        registerModuleAndForward(rv.module, res.url);
      }
      return rv;
    });
  });
};

function registerModuleAndForward(module, url) {
  const buildId = getBuildId(module);

  if (buildId) {
    const image = {
      type: 'wasm',
      code_id: buildId,
      code_file: url,
      debug_file: null,
      debug_id: `${`${buildId}00000000000000000000000000000000`.slice(0, 32)}0`,
    };

    self.postMessage({
      _sentryMessage: true,
      _sentryWasmImages: [image],
    });
  }
}

// Extract build ID from WASM module
function getBuildId(module) {
  const sections = WebAssembly.Module.customSections(module, 'build_id');
  if (sections.length > 0) {
    const buildId = Array.from(new Uint8Array(sections[0]))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    return buildId;
  }
  return null;
}

// Handle messages from the main thread
self.addEventListener('message', async event => {
  if (event.origin !== '' && event.origin !== self.location.origin) {
    return;
  }

  function crash() {
    throw new Error('WASM error from worker');
  }

  if (event.data.type === 'load-wasm-and-crash') {
    const wasmUrl = event.data.wasmUrl;

    try {
      const { instance } = await WebAssembly.instantiateStreaming(fetch(wasmUrl), {
        env: {
          external_func: crash,
        },
      });

      instance.exports.internal_func();
    } catch (err) {
      self.postMessage({
        _sentryMessage: true,
        _sentryWorkerError: {
          reason: err,
          filename: self.location.href,
        },
      });
    }
  }
});

self.addEventListener('unhandledrejection', event => {
  self.postMessage({
    _sentryMessage: true,
    _sentryWorkerError: {
      reason: event.reason,
      filename: self.location.href,
    },
  });
});

// Let the main thread know that worker is ready
self.postMessage({ _sentryMessage: false, type: 'WORKER_READY' });
