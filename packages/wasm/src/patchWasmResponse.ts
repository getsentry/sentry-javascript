import { fill } from '@sentry/core';

/**
 * Streaming wasm registration (`instantiateStreaming` / `compileStreaming`) reads the module URL
 * from `Response.url`. Non-streaming paths (`WebAssembly.instantiate` / `compile` with bytes) only
 * receive a buffer, no URL, so registration would otherwise be skipped.
 *
 * This module patches `Response.prototype.arrayBuffer` and `bytes` so that when wasm is fetched
 * and then loaded from bytes, we can map the resulting `ArrayBuffer` back to the fetch URL via
 * `getWasmSourceUrl()` and register the module in `patchNonStreamingWebAssembly`.
 *
 * Every response body is tagged, not only the wasm-looking ones. A tag is read back solely after a
 * `WebAssembly` compile already succeeded, so tagging a non-wasm buffer can never be observed,
 * whereas guessing from content type or file extension would silently drop modules served as
 * `application/octet-stream` or from extension-less URLs.
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

/**
 * Synthetic responses (`new Response(...)`) have no URL and nothing to tag,
 * so their body reads are passed through untouched.
 */
function responseUrl(response: Response): string | undefined {
  try {
    return response.url || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Runs inside the caller's `arrayBuffer()` / `bytes()` promise chain, so it must never throw:
 * a failure here would reject a body read that has nothing to do with wasm.
 */
function tagResponseSource(source: unknown, url: string): void {
  try {
    const buffer = toArrayBuffer(source);
    if (buffer) {
      wasmSourceUrls.set(buffer, url);
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
      const url = responseUrl(this);
      if (!url) {
        return bufferPromise;
      }
      return bufferPromise.then(buffer => {
        tagResponseSource(buffer, url);
        return buffer;
      });
    };
  });

  fill(Response.prototype, 'bytes', (original: (this: Response) => Promise<Uint8Array>) => {
    return function bytes(this: Response): Promise<Uint8Array> {
      const bytesPromise: Promise<Uint8Array> = original.call(this);
      const url = responseUrl(this);
      if (!url) {
        return bytesPromise;
      }
      return bytesPromise.then(bytes => {
        tagResponseSource(bytes, url);
        return bytes;
      });
    };
  });
}

/** @internal */
export function _resetResponsePatchForTests(): void {
  responseReadersPatched = false;
}
