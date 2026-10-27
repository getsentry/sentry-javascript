// This worker manually replicates what Sentry.registerWebWorkerWasm() does.
// the reason for manual replication is that it allows us to test the message-passing protocol
//  between worker and main thread independent of SDK implementation details
// in production code you would do: registerWebWorkerWasm({ self });

// Bytes-compiled modules carry no URL, so remember the fetch URL per buffer
// like the SDK's Response patch does.
const bufferUrls = new WeakMap();
const origArrayBuffer = Response.prototype.arrayBuffer;
Response.prototype.arrayBuffer = function arrayBuffer() {
  return origArrayBuffer.call(this).then(buffer => {
    if (this.url) {
      bufferUrls.set(buffer, this.url);
    }
    return buffer;
  });
};

const origInstantiate = WebAssembly.instantiate;
WebAssembly.instantiate = function instantiate(source, importObject) {
  return origInstantiate(source, importObject).then(result => {
    const url = bufferUrls.get(source instanceof ArrayBuffer ? source : source.buffer);
    if (url && result.module) {
      registerModuleAndForward(result.module, url);
    }
    return result;
  });
};

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
    const moduleName = getModuleName(module);
    if (moduleName) {
      image.moduleName = moduleName;
    }

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

// Read the module name from the `name` custom section. Chrome labels
// bytes-compiled modules `wasm://wasm/<name>-<hash>`, and the main thread
// links such frames to this image by that name.
function getModuleName(module) {
  const sections = WebAssembly.Module.customSections(module, 'name');
  if (sections.length === 0) {
    return null;
  }
  const bytes = new Uint8Array(sections[0]);
  // Subsection id 0 is the module name: id, payload size, name length, name.
  // Sizes are LEB128, but the fixture's fit in one byte each.
  if (bytes[0] !== 0) {
    return null;
  }
  const length = bytes[2];
  return new TextDecoder().decode(bytes.subarray(3, 3 + length));
}

// Handle messages from the main thread
self.addEventListener('message', async event => {
  if (event.origin !== '' && event.origin !== self.location.origin) {
    return;
  }

  function crash() {
    throw new Error('WASM error from worker');
  }

  if (event.data.type === 'load-wasm-and-crash' || event.data.type === 'load-wasm-bytes-and-crash') {
    const wasmUrl = event.data.wasmUrl;
    const imports = {
      env: {
        external_func: crash,
      },
    };

    try {
      let instance;
      if (event.data.type === 'load-wasm-bytes-and-crash') {
        const response = await fetch(wasmUrl);
        const buffer = await response.arrayBuffer();
        ({ instance } = await WebAssembly.instantiate(new Uint8Array(buffer), imports));
      } else {
        ({ instance } = await WebAssembly.instantiateStreaming(fetch(wasmUrl), imports));
      }

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
