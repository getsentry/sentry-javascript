import { flushIfServerless, getTraceMetaTags } from '@sentry/core';
import { captureException, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, startSpan } from '@sentry/node';
import { SENTRY_OP } from '@sentry/conventions/attributes';
import { FUNCTION } from '@sentry/conventions/op';
import { updateSpanWithRouteParametrization } from './routeParametrization';

declare const __SENTRY_ROUTE_PATTERNS__: string[] | undefined;

export type ServerEntry = {
  // `opts` is forwarded verbatim to the wrapped handler, so this must accept whatever shape
  // the real framework entry uses (e.g. TanStack's `RequestOptions<Register>`). Under
  // parameter contravariance `unknown` would reject such an entry; `any` keeps it assignable.
  // oxlint-disable-next-line typescript/no-explicit-any
  fetch: (request: Request, opts?: any) => Promise<Response> | Response;
};

const MAX_TAG_NAME_LENGTH = 16;

// Upper bound on the head content held back while deciding whether the response already
// carries trace meta tags. Reaching it means the document has no `</head>`, so we stop
// waiting and emit what we have.
const MAX_HEAD_BUFFER_LENGTH = 64 * 1024;

function isHtmlWhitespace(char: string): boolean {
  return char === ' ' || char === '\n' || char === '\t' || char === '\r' || char === '\f';
}

type HeadMetaTagInjector = {
  /** Returns the chunk to emit in place of `htmlChunk`, which may be empty. */
  transformChunk: (htmlChunk: string) => string;
  /** Returns anything still held back once the body has ended. */
  flush: () => string;
};

/**
 * Creates an injector that takes the HTML chunks of a single response, in order, and
 * injects `metaTagsStr` directly after the head tag.
 *
 * The scan carries its state from one chunk to the next, so a tag, an attribute value,
 * a comment, or the head tag itself may be split across any number of chunks. The result
 * depends only on the bytes of the response, never on where they happen to be split.
 */
function createHeadMetaTagInjector(metaTagsStr: string): HeadMetaTagInjector {
  if (!metaTagsStr) {
    return { transformChunk: htmlChunk => htmlChunk, flush: () => '' };
  }

  // Set once the tags are injected, or once no head tag can follow any more.
  let done = false;
  // The head content read so far, held back while `decideOnBufferedHead` has not settled.
  let headBuffer: string | undefined;
  // Inside an HTML comment.
  let inComment = false;
  // Inside a tag, between `<` and the `>` that closes it.
  let inTag = false;
  // The quote character that opened the attribute value being read.
  let quote: string | undefined;
  // Reading the tag name that follows `<`.
  let readingTagName = false;
  // The lower-cased name of the tag being read, e.g. `head`, `/head`, `!doctype`.
  let tagName = '';
  // The number of dashes read directly before the current position, for spotting `-->`.
  let commentDashes = 0;

  /**
   * Decides what to do with the head content read so far. Returns the text to emit, or an
   * empty string while the decision still needs more of the head.
   */
  function decideOnBufferedHead(): string {
    const buffered = headBuffer as string;

    // The response already carries trace meta tags, e.g. rendered by the app itself.
    if (buffered.includes('"sentry-trace"')) {
      done = true;
      headBuffer = undefined;
      return buffered;
    }

    if (buffered.includes('</head') || buffered.length >= MAX_HEAD_BUFFER_LENGTH) {
      done = true;
      headBuffer = undefined;
      return `${metaTagsStr}${buffered}`;
    }

    return '';
  }

  function transformChunk(htmlChunk: string): string {
    if (done || typeof htmlChunk !== 'string') {
      return htmlChunk;
    }

    if (headBuffer !== undefined) {
      headBuffer += htmlChunk;
      return decideOnBufferedHead();
    }

    for (let i = 0; i < htmlChunk.length; i++) {
      const char = htmlChunk.charAt(i);

      if (inComment) {
        if (char === '-') {
          commentDashes++;
        } else {
          if (char === '>' && commentDashes >= 2) {
            inComment = false;
          }
          commentDashes = 0;
        }
        continue;
      }

      if (quote) {
        if (char === quote) {
          quote = undefined;
        }
        continue;
      }

      if (!inTag) {
        if (char === '<') {
          inTag = true;
          readingTagName = true;
          tagName = '';
        }
        continue;
      }

      if (readingTagName) {
        if (!isHtmlWhitespace(char) && char !== '>') {
          if (tagName.length < MAX_TAG_NAME_LENGTH) {
            tagName += char.toLowerCase();
          }
          if (tagName === '!--') {
            inComment = true;
            inTag = false;
            readingTagName = false;
            commentDashes = 0;
          }
          continue;
        }
        readingTagName = false;
      }

      if (char === '"' || char === "'") {
        quote = char;
        continue;
      }

      if (char !== '>') {
        continue;
      }

      inTag = false;

      if (tagName === 'head') {
        // Hold the head content back until we know whether the app rendered its own trace
        // meta tags. Deciding on the buffer rather than on the current chunk keeps the
        // outcome the same however the response is split.
        headBuffer = htmlChunk.slice(i + 1);
        return `${htmlChunk.slice(0, i + 1)}${decideOnBufferedHead()}`;
      }

      // No head tag can open after these. Stop, so that a `<head>` appearing later in
      // script or text content cannot be mistaken for one.
      if (tagName === '/head' || tagName === 'body' || tagName === '/html') {
        done = true;
        return htmlChunk;
      }
    }

    return htmlChunk;
  }

  return {
    transformChunk,
    flush() {
      if (done || headBuffer === undefined) {
        return '';
      }
      // The body ended inside the head, so the decision can wait no longer.
      const buffered = headBuffer;
      done = true;
      headBuffer = undefined;
      return buffered.includes('"sentry-trace"') ? buffered : `${metaTagsStr}${buffered}`;
    },
  };
}

function injectMetaTagsInResponse(originalResponse: Response): Response {
  try {
    const contentType = originalResponse.headers.get('content-type');

    const isPageloadRequest = contentType?.startsWith('text/html');
    if (!isPageloadRequest) {
      return originalResponse;
    }

    const originalBody = originalResponse.body;
    if (!originalBody) {
      return originalResponse;
    }

    const metaTagsStr = getTraceMetaTags();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    const injector = createHeadMetaTagInjector(metaTagsStr);
    const reader = originalBody.getReader();

    // Reading in `pull` rather than `start` keeps the response demand-driven: a chunk is
    // taken from the body only once the consumer asks for one. A transform upstream of us
    // that pauses while our `desiredSize` is at or below zero, as TanStack's router stream
    // does, can then actually pause instead of being drained as fast as it can produce.
    const newResponseStream = new ReadableStream({
      async pull(controller) {
        try {
          // A `pull` that enqueues nothing is not called again, and the injector emits
          // nothing while it holds the head back, so keep reading until there is either
          // something to emit or nothing left to read.
          for (;;) {
            const { done, value } = await reader.read();

            if (done) {
              // Flush whatever the decoder is still holding back, so that a body ending on
              // an incomplete byte sequence does not lose its tail.
              const trailingHtml = injector.transformChunk(decoder.decode()) + injector.flush();
              if (trailingHtml) {
                controller.enqueue(encoder.encode(trailingHtml));
              }
              controller.close();
              return;
            }

            const html = typeof value === 'string' ? value : decoder.decode(value, { stream: true });
            const modifiedHtml = injector.transformChunk(html);
            if (modifiedHtml) {
              controller.enqueue(encoder.encode(modifiedHtml));
              return;
            }
          }
        } catch (e) {
          captureException(e, {
            mechanism: { type: 'auto.http.tanstackstart', handled: false },
          });
          controller.error(e);
        }
      },
      cancel(reason) {
        return reader.cancel(reason);
      },
    });

    return new Response(newResponseStream, {
      status: originalResponse.status,
      statusText: originalResponse.statusText,
      headers: new Headers(originalResponse.headers),
    });
  } catch (e) {
    captureException(e, {
      mechanism: { type: 'auto.http.tanstackstart', handled: false },
    });
    throw e;
  }
}

/**
 * This function can be used to wrap the server entry request handler to add tracing to server-side functionality.
 * You must explicitly define a server entry point in your application for this to work. This is done by passing the request handler to the `createServerEntry` function.
 * For more information about the server entry point, see the [TanStack Start documentation](https://tanstack.com/start/docs/server-entry).
 *
 * @example
 * ```ts
 * import { wrapFetchWithSentry } from '@sentry/tanstackstart-react';
 *
 * import handler, { createServerEntry } from '@tanstack/react-start/server-entry';
 * import type { ServerEntry } from '@tanstack/react-start/server-entry';
 *
 * const requestHandler: ServerEntry = wrapFetchWithSentry({
 *  fetch(request: Request) {
 *    return handler.fetch(request);
 *  },
 * });
 *
 * export default serverEntry = createServerEntry(requestHandler);
 * ```
 *
 * @param serverEntry - request handler to wrap
 * @returns - wrapped request handler
 */
export function wrapFetchWithSentry(serverEntry: ServerEntry): ServerEntry {
  if (serverEntry.fetch) {
    serverEntry.fetch = new Proxy<typeof serverEntry.fetch>(serverEntry.fetch, {
      async apply(target, thisArg, args) {
        try {
          const request: Request = args[0];
          const url = new URL(request.url);
          const method = request.method || 'GET';

          // instrument server functions
          if (url.pathname.includes('_serverFn') || url.pathname.includes('createServerFn')) {
            return await startSpan(
              {
                name: `${method} ${url.pathname}`,
                attributes: {
                  [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.tanstackstart.server',
                  [SENTRY_OP]: FUNCTION,
                },
              },
              async () => {
                return target.apply(thisArg, args);
              },
            );
          }

          if (typeof __SENTRY_ROUTE_PATTERNS__ !== 'undefined') {
            updateSpanWithRouteParametrization(method, url.pathname, __SENTRY_ROUTE_PATTERNS__);
          }

          return injectMetaTagsInResponse(await target.apply(thisArg, args));
        } finally {
          await flushIfServerless();
        }
      },
    });
  }
  return serverEntry;
}
