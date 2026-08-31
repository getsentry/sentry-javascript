/**
 * Streaming wasm registration (`instantiateStreaming` / `compileStreaming`) reads the module URL
 * from `Response.url`. Non-streaming paths (`WebAssembly.instantiate` / `compile` with bytes) only
 * receive a buffer — no URL — so registration would otherwise be skipped.
 *
 * This module patches `Response.prototype.arrayBuffer` and `bytes` so that when wasm is fetched
 * and then loaded from bytes, we can map the resulting `ArrayBuffer` back to the fetch URL via
 * `getWasmSourceUrl()` and register the module in `patchNonStreamingWebAssembly`.
 */
const wasmSourceUrls = new WeakMap<ArrayBuffer, string>();

const PATCHED_SYMBOL = Symbol.for('__sentryWasmPatched');

type MaybePatched = { [PATCHED_SYMBOL]?: boolean };

/**
 * Resolves a wasm source buffer back to its fetch URL, when known.
 */
export function getWasmSourceUrl(source: BufferSource): string | undefined {
  const buffer = toArrayBuffer(source);
  if (!buffer) {
    return undefined;
  }

  return wasmSourceUrls.get(buffer);
}

function toArrayBuffer(source: BufferSource): ArrayBuffer | undefined {
  if (source instanceof ArrayBuffer) {
    return source;
  }

  if (ArrayBuffer.isView(source)) {
    const { buffer } = source;
    return buffer instanceof ArrayBuffer ? buffer : undefined;
  }

  return undefined;
}

function looksLikeWasmResponse(response: Response): boolean {
  const contentType = response.headers.get('content-type');
  if (contentType?.includes('application/wasm')) {
    return true;
  }

  const { url } = response;
  return Boolean(url && /\.wasm(?:\?|#|$)/i.test(url));
}

function tagResponseBuffer(response: Response, buffer: ArrayBuffer): void {
  if (looksLikeWasmResponse(response) && response.url) {
    wasmSourceUrls.set(buffer, response.url);
  }
}

/**
 * Patches Response body readers so wasm bytes remember their fetch URL.
 */
export function patchWasmResponseBodyReaders(): void {
  if (typeof Response === 'undefined') {
    return;
  }

  const responseProto = Response.prototype as MaybePatched;
  if (responseProto[PATCHED_SYMBOL]) {
    return;
  }

  responseProto[PATCHED_SYMBOL] = true;

  // oxlint-disable-next-line typescript/unbound-method
  const origArrayBuffer: (this: Response) => Promise<ArrayBuffer> = Response.prototype.arrayBuffer;
  Response.prototype.arrayBuffer = function arrayBuffer(this: Response): Promise<ArrayBuffer> {
    const bufferPromise: Promise<ArrayBuffer> = origArrayBuffer.call(this);
    return bufferPromise.then((buffer: ArrayBuffer) => {
      tagResponseBuffer(this, buffer);
      return buffer;
    });
  };

  if ('bytes' in Response.prototype) {
    // oxlint-disable-next-line typescript/unbound-method
    const origBytes: (this: Response) => Promise<Uint8Array> = Response.prototype.bytes;
    Response.prototype.bytes = function bytes(this: Response) {
      const bytesPromise: Promise<Uint8Array> = origBytes.call(this);
      return bytesPromise.then((bytes: Uint8Array) => {
        const { buffer } = bytes;
        if (buffer instanceof ArrayBuffer) {
          tagResponseBuffer(this, buffer);
        }
        return bytes;
      });
    } as typeof Response.prototype.bytes;
  }
}

/** @internal */
export function _resetResponsePatchForTests(): void {
  if (typeof Response !== 'undefined') {
    (Response.prototype as MaybePatched)[PATCHED_SYMBOL] = false;
  }
}
