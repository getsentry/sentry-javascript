import { _INTERNAL_getReleaseMetaTag as getReleaseMetaTag } from '@sentry/core/server';
import type { ServerEntry } from './wrapFetchWithSentry';

const HEAD_CLOSING_TAG = new TextEncoder().encode('</head>');

// Bytes before `</head>` stream through while we search, so this only bounds the search in pages without a
// `</head>`. Inline styles and scripts can make `<head>` large, so it leaves plenty of room for them.
const MAX_BYTES_BEFORE_HEAD_END = 1024 * 1024;

/**
 * Writes the release at the end of the `<head>` of each page the server entry renders, where the client SDK reads it.
 * The `sentryTanstackStart` Vite plugin wraps the server entry with this when it builds the app.
 *
 * @internal Only the code the Vite plugin generates calls this, so its parameters can change at any time.
 */
export function addReleaseMetaTag<T extends ServerEntry>(serverEntry: T, release: string): T {
  if (typeof serverEntry?.fetch !== 'function') {
    return serverEntry;
  }

  const metaTag = new TextEncoder().encode(getReleaseMetaTag(release));

  return {
    ...serverEntry,
    async fetch(...args: Parameters<ServerEntry['fetch']>) {
      return injectMetaTag(await serverEntry.fetch(...args), metaTag);
    },
  };
}

function injectMetaTag(response: Response, metaTag: Uint8Array): Response {
  if (
    !response.body ||
    !response.headers.get('content-type')?.startsWith('text/html') ||
    response.headers.has('content-encoding')
  ) {
    return response;
  }

  let pending: Uint8Array | undefined = new Uint8Array(0);
  let searchedBytes = 0;

  // The tag goes last in `<head>`: React 18 hydrates `<head>` children in order, so a tag before the app's own
  // elements would be claimed for the first of them and shift the rest.
  const body = response.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        if (!pending) {
          controller.enqueue(chunk);
          return;
        }

        const buffered = concat(pending, chunk);
        const headEnd = indexOfHeadClosingTag(buffered);
        if (headEnd !== -1) {
          controller.enqueue(buffered.subarray(0, headEnd));
          controller.enqueue(metaTag);
          controller.enqueue(buffered.subarray(headEnd));
          pending = undefined;
          return;
        }

        searchedBytes += chunk.length;
        if (searchedBytes > MAX_BYTES_BEFORE_HEAD_END) {
          controller.enqueue(buffered);
          pending = undefined;
          return;
        }

        // Hold back the bytes that could start a `</head>` split across chunks.
        const heldBack = partialHeadClosingTagLength(buffered);
        if (heldBack < buffered.length) {
          controller.enqueue(buffered.subarray(0, buffered.length - heldBack));
        }
        pending = buffered.slice(buffered.length - heldBack);
      },
      flush(controller) {
        if (pending?.length) {
          controller.enqueue(pending);
        }
      },
    }),
  );

  const headers = new Headers(response.headers);
  headers.delete('content-length');

  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}

// `</head>` is ASCII, and UTF-8 never encodes an ASCII character as part of a multi-byte sequence, so matching
// bytes finds it the same way as in the decoded document.
function indexOfHeadClosingTag(bytes: Uint8Array): number {
  for (let start = 0; start + HEAD_CLOSING_TAG.length <= bytes.length; start++) {
    if (matchesHeadClosingTag(bytes, start, HEAD_CLOSING_TAG.length)) {
      return start;
    }
  }
  return -1;
}

function partialHeadClosingTagLength(bytes: Uint8Array): number {
  for (let length = Math.min(HEAD_CLOSING_TAG.length - 1, bytes.length); length > 0; length--) {
    if (matchesHeadClosingTag(bytes, bytes.length - length, length)) {
      return length;
    }
  }
  return 0;
}

function matchesHeadClosingTag(bytes: Uint8Array, start: number, length: number): boolean {
  for (let i = 0; i < length; i++) {
    if (toLowerCase(bytes[start + i] as number) !== HEAD_CLOSING_TAG[i]) {
      return false;
    }
  }
  return true;
}

function toLowerCase(byte: number): number {
  return byte >= 0x41 && byte <= 0x5a ? byte + 0x20 : byte;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (!a.length) {
    return b;
  }

  const result = new Uint8Array(a.length + b.length);
  result.set(a);
  result.set(b, a.length);
  return result;
}
