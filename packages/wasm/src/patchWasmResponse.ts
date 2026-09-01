import { addNonEnumerableProperty, fill } from '@sentry/core';

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

  const proto = Response.prototype as unknown as Record<string, unknown>;

  fill(proto, 'arrayBuffer', (original: (this: Response) => Promise<ArrayBuffer>) => {
    return function arrayBuffer(this: Response): Promise<ArrayBuffer> {
      const bufferPromise: Promise<ArrayBuffer> = original.call(this);
      return bufferPromise.then((buffer: ArrayBuffer) => {
        tagResponseBuffer(this, buffer);
        return buffer;
      });
    };
  });

  fill(proto, 'bytes', (original: (this: Response) => Promise<Uint8Array>) => {
    return function bytes(this: Response): Promise<Uint8Array> {
      const bytesPromise: Promise<Uint8Array> = original.call(this);
      return bytesPromise.then((bytes: Uint8Array) => {
        const { buffer } = bytes;
        if (buffer instanceof ArrayBuffer) {
          tagResponseBuffer(this, buffer);
        }
        return bytes;
      });
    };
  });

  addNonEnumerableProperty(responseProto, PATCHED_SYMBOL, true);
}

/** @internal */
export function _resetResponsePatchForTests(): void {
  if (typeof Response !== 'undefined') {
    addNonEnumerableProperty(Response.prototype, PATCHED_SYMBOL, false);
  }
}
