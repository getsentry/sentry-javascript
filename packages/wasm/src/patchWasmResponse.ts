import { fill } from '@sentry/core';

/**
 * Streaming wasm registration (`instantiateStreaming` / `compileStreaming`) reads the module URL
 * from `Response.url`. Non-streaming paths (`WebAssembly.instantiate` / `compile` with bytes) only
 * receive a buffer, no URL, so registration would otherwise be skipped.
 *
 * This module patches `Response.prototype.arrayBuffer` and `bytes` so that when wasm is fetched
 * and then loaded from bytes, we can map the resulting `ArrayBuffer` back to the fetch URL via
 * `getWasmSourceUrl()` and register the module in `patchNonStreamingWebAssembly`.
 */
const wasmSourceUrls = new WeakMap<ArrayBuffer, string>();

let responseReadersPatched = false;

/**
 * Resolves a wasm source buffer back to its fetch URL, when known.
 */
export function getWasmSourceUrl(source: unknown): string | undefined {
  const buffer = toArrayBuffer(source);
  if (!buffer) {
    return undefined;
  }

  return wasmSourceUrls.get(buffer);
}

function toArrayBuffer(source: unknown): ArrayBuffer | undefined {
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

/**
 * Runs inside the caller's `arrayBuffer()` / `bytes()` promise chain, so it must never throw:
 * a failure here would reject a body read that has nothing to do with wasm.
 */
function tagResponseSource(response: Response, source: unknown): void {
  try {
    const buffer = toArrayBuffer(source);
    if (buffer && response.url && looksLikeWasmResponse(response)) {
      wasmSourceUrls.set(buffer, response.url);
    }
  } catch {
    // see above
  }
}

/**
 * Patches Response body readers so wasm bytes remember their fetch URL.
 */
export function patchWasmResponseBodyReaders(): void {
  if (responseReadersPatched || typeof Response === 'undefined') {
    return;
  }

  responseReadersPatched = true;

  fill(Response.prototype, 'arrayBuffer', (original: (this: Response) => Promise<ArrayBuffer>) => {
    return function arrayBuffer(this: Response): Promise<ArrayBuffer> {
      const bufferPromise: Promise<ArrayBuffer> = original.call(this);
      return bufferPromise.then(buffer => {
        tagResponseSource(this, buffer);
        return buffer;
      });
    };
  });

  fill(Response.prototype, 'bytes', (original: (this: Response) => Promise<Uint8Array>) => {
    return function bytes(this: Response): Promise<Uint8Array> {
      const bytesPromise: Promise<Uint8Array> = original.call(this);
      return bytesPromise.then(bytes => {
        tagResponseSource(this, bytes);
        return bytes;
      });
    };
  });
}

/** @internal */
export function _resetResponsePatchForTests(): void {
  responseReadersPatched = false;
}
