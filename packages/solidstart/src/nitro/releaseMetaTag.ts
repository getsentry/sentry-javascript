import { _INTERNAL_getReleaseMetaTag as getReleaseMetaTag } from '@sentry/core/server';

const HEAD_OPENING_TAG = /<head(?:\s[^>]*)?>/i;

// Bounds what a streamed page is buffered for while looking for `<head>`.
const MAX_BUFFERED_CHARS = 64 * 1024;

/**
 * Adds the release `<meta>` tag that the browser SDK reads to an HTML page. Bodies that are not HTML, or whose
 * `<head>` cannot be found, are returned as they are.
 *
 * @param contentType The response's content type. A `Response` body brings its own.
 */
export function addReleaseMetaTag(body: unknown, release: string, contentType: string | undefined): unknown {
  if (body instanceof Response) {
    return addReleaseMetaTagToResponse(body, release);
  }

  if (!isHtml(contentType)) {
    return body;
  }

  if (typeof body === 'string') {
    return injectIntoHtml(body, release) ?? body;
  }

  if (body instanceof ReadableStream) {
    return injectIntoHtmlStream(body, release);
  }

  return body;
}

function addReleaseMetaTagToResponse(response: Response, release: string): Response {
  if (!response.body || response.headers.has('content-encoding') || !isHtml(response.headers.get('content-type'))) {
    return response;
  }

  const headers = new Headers(response.headers);
  headers.delete('content-length');

  return new Response(injectIntoHtmlStream(response.body, release), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function isHtml(contentType: string | null | undefined): boolean {
  return !!contentType?.toLowerCase().startsWith('text/html');
}

function injectIntoHtml(html: string, release: string): string | undefined {
  const match = HEAD_OPENING_TAG.exec(html);
  if (!match) {
    return undefined;
  }

  const end = match.index + match[0].length;
  return `${html.slice(0, end)}${getReleaseMetaTag(release)}${html.slice(end)}`;
}

function injectIntoHtmlStream(body: ReadableStream<Uint8Array | string>, release: string): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let pending: string | undefined = '';

  const decode = (chunk: Uint8Array | string): string =>
    typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });

  return body.pipeThrough(
    new TransformStream<Uint8Array | string, Uint8Array>({
      transform(chunk, controller) {
        if (pending === undefined) {
          controller.enqueue(encoder.encode(decode(chunk)));
          return;
        }

        pending += decode(chunk);
        const injected = injectIntoHtml(pending, release);
        if (injected !== undefined || pending.length > MAX_BUFFERED_CHARS) {
          controller.enqueue(encoder.encode(injected ?? pending));
          pending = undefined;
        }
      },
      flush(controller) {
        const rest = (pending ?? '') + decoder.decode();
        if (rest) {
          controller.enqueue(encoder.encode(rest));
        }
      },
    }),
  );
}
