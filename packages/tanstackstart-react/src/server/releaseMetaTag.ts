import { RELEASE_META_TAG_NAME } from '../common/release';
import type { ServerEntry } from './wrapFetchWithSentry';

const HEAD_TAG = /<head(?:\s[^>]*)?>/i;

// The `<head>` tag opens the document, so giving up after this many bytes keeps responses without one streaming.
const MAX_BYTES_BEFORE_HEAD = 16 * 1024;

/**
 * Writes the release into the `<head>` of each page the server entry renders, where the client SDK reads it. The
 * `sentryTanstackStart` Vite plugin wraps the server entry with this when it builds the app.
 *
 * @internal Only the code the Vite plugin generates calls this, so its parameters can change at any time.
 */
export function addReleaseMetaTag<T extends ServerEntry>(serverEntry: T, release: string): T {
  if (typeof serverEntry?.fetch !== 'function') {
    return serverEntry;
  }

  const metaTag = new TextEncoder().encode(
    `<meta name="${RELEASE_META_TAG_NAME}" content="${escapeAttribute(release)}"/>`,
  );

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

  const body = response.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        if (!pending) {
          controller.enqueue(chunk);
          return;
        }

        const buffered = concat(pending, chunk);
        const headTagEnd = findHeadTagEnd(buffered);
        if (headTagEnd !== undefined) {
          controller.enqueue(buffered.subarray(0, headTagEnd));
          controller.enqueue(metaTag);
          controller.enqueue(buffered.subarray(headTagEnd));
          pending = undefined;
        } else if (buffered.length > MAX_BYTES_BEFORE_HEAD) {
          controller.enqueue(buffered);
          pending = undefined;
        } else {
          pending = buffered;
        }
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

function findHeadTagEnd(bytes: Uint8Array): number | undefined {
  // One character per byte keeps string offsets equal to byte offsets. UTF-8 never encodes an ASCII character as
  // part of a multi-byte sequence, so `<head>` matches the same way as in the decoded document.
  let text = '';
  for (const byte of bytes) {
    text += String.fromCharCode(byte);
  }

  const match = HEAD_TAG.exec(text);
  return match ? match.index + match[0].length : undefined;
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

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
