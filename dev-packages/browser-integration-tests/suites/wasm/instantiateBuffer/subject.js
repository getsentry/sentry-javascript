function leb128(n) {
  const out = [];
  do {
    let byte = n & 0x7f;
    n >>>= 7;
    if (n !== 0) {
      byte |= 0x80;
    }
    out.push(byte);
  } while (n !== 0);
  return out;
}

// Appends a custom section with `padding` payload bytes so the module wire
// bytes cross V8's 16383-byte content-hashing cutoff.
function pad(bytes, padding) {
  const payload = new Uint8Array(padding);
  for (let i = 0; i < padding; i++) {
    payload[i] = (i * 31 + 7) & 0xff;
  }
  const content = [1, 0x70, ...leb128(payload.length)];
  const header = [0x00, ...leb128(2 + payload.length)];
  const out = new Uint8Array(bytes.length + header.length + 2 + payload.length);
  out.set(bytes, 0);
  out.set(header, bytes.length);
  out.set([1, 0x70], bytes.length + header.length);
  out.set(payload, bytes.length + header.length + 2);
  return out;
}

window.getEvent = async padding => {
  function crash() {
    throw new Error('whoops');
  }

  const response = await fetch('https://localhost:5887/simple.wasm');
  const buffer = await response.arrayBuffer();
  const bytes = padding ? pad(new Uint8Array(buffer), padding) : new Uint8Array(buffer);

  const { instance } = await WebAssembly.instantiate(bytes, {
    env: {
      external_func: crash,
    },
  });

  try {
    instance.exports.internal_func();
  } catch (err) {
    Sentry.captureException(err);
    return { event: window.events.pop(), byteLength: bytes.byteLength };
  }
};
