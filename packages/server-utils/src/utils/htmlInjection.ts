const HEAD_CLOSING_TAG = '</head>';

type InjectHtmlIntoHeadOptions = {
  /** Called with the error when reading the original body fails. */
  onError?: (error: unknown) => void;
  /**
   * Text that shows the head already contains the markup, e.g. `'"sentry-trace"'`. When the head
   * contains it before the closing head tag, nothing is injected.
   */
  skipIfHeadContains?: string;
};

type HeadHtmlInjector = {
  /** Returns the text to emit in place of `htmlChunk`, which may be empty. */
  transformChunk: (htmlChunk: string) => string;
  /** Returns anything still held back once the body has ended. */
  flush: () => string;
};

/**
 * Creates an injector that takes the HTML chunks of a single response, in order, and injects
 * `html` directly before the closing head tag.
 *
 * The scan carries its state from one chunk to the next, so the closing tag may be split
 * across any number of chunks. Anchoring on the closing tag means everything the head
 * contains has already been seen by the time the injection happens, so `skipIfHeadContains`
 * is detected with certainty. The result depends only on the bytes of the response, never on
 * where they happen to be split.
 */
function createHeadHtmlInjector(html: string, skipIfHeadContains: string | undefined): HeadHtmlInjector {
  if (!html) {
    return { transformChunk: htmlChunk => htmlChunk, flush: () => '' };
  }

  // Held back at the end of each chunk so that either token is still recognised when a chunk
  // boundary splits it.
  const carryLength = Math.max(HEAD_CLOSING_TAG.length, skipIfHeadContains?.length ?? 0) - 1;

  let done = false;
  let carry = '';

  return {
    transformChunk(htmlChunk: string): string {
      if (done) {
        return htmlChunk;
      }

      const chunk = carry + htmlChunk;
      const closingIndex = chunk.indexOf(HEAD_CLOSING_TAG);
      const existingIndex = skipIfHeadContains ? chunk.indexOf(skipIfHeadContains) : -1;

      if (existingIndex !== -1 && (closingIndex === -1 || existingIndex < closingIndex)) {
        done = true;
        carry = '';
        return chunk;
      }

      if (closingIndex !== -1) {
        done = true;
        carry = '';
        return `${chunk.slice(0, closingIndex)}${html}${chunk.slice(closingIndex)}`;
      }

      let keep = Math.min(carryLength, chunk.length);
      // The two sides of the cut are encoded separately, and a lone surrogate encodes to
      // U+FFFD, so keep a surrogate pair together.
      const leadingCharCode = chunk.charCodeAt(chunk.length - keep - 1);
      if (leadingCharCode >= 0xd800 && leadingCharCode <= 0xdbff) {
        keep++;
      }

      carry = chunk.slice(chunk.length - keep);
      return chunk.slice(0, chunk.length - keep);
    },
    flush(): string {
      const buffered = carry;
      carry = '';
      return buffered;
    },
  };
}

/**
 * Rewrites an HTML body stream so that `html` sits directly before the closing head tag.
 *
 * @param body - the HTML body stream to rewrite
 * @param html - the markup to inject, e.g. the output of `getTraceMetaTags()`
 */
export function injectHtmlIntoHeadStream(
  body: ReadableStream<Uint8Array | string>,
  html: string,
  { onError, skipIfHeadContains }: InjectHtmlIntoHeadOptions = {},
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const injector = createHeadHtmlInjector(html, skipIfHeadContains);

  // A TransformStream carries the consumer's backpressure through to the body it wraps.
  // Pumping the body into a ReadableStream instead would read it as fast as it can be
  // produced, which keeps our `desiredSize` positive and stops an upstream transform that
  // throttles itself against it, such as a framework's own SSR stream, from ever pausing.
  const { readable, writable } = new TransformStream<Uint8Array | string, Uint8Array>({
    transform(chunk, controller) {
      const htmlChunk = typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
      const modifiedHtml = injector.transformChunk(htmlChunk);
      if (modifiedHtml) {
        controller.enqueue(encoder.encode(modifiedHtml));
      }
    },
    flush(controller) {
      // Flush the decoder as well, so that a body ending on an incomplete byte sequence does
      // not lose its tail.
      const trailingHtml = injector.transformChunk(decoder.decode()) + injector.flush();
      if (trailingHtml) {
        controller.enqueue(encoder.encode(trailingHtml));
      }
    },
  });

  const reader = body.getReader();
  const writer = writable.getWriter();

  // Pumping by hand rather than with `pipeTo` keeps the two failure modes apart: only a body
  // that fails to read is reported, while a consumer that goes away is not an error.
  async function pump(): Promise<void> {
    for (;;) {
      let result: ReadableStreamReadResult<Uint8Array | string>;
      try {
        result = await reader.read();
      } catch (error) {
        onError?.(error);
        await writer.abort(error);
        return;
      }

      if (result.done) {
        await writer.close();
        return;
      }

      // Resolves only once the readable side has room, which is what carries backpressure
      // through to the body.
      await writer.write(result.value);
    }
  }

  pump().catch((reason: unknown) => {
    reader.cancel(reason).catch(() => undefined);
  });

  return readable;
}

/**
 * Returns a copy of `response` whose HTML body carries `html` directly before the closing head
 * tag. Responses that are not HTML, responses without a body, and responses with nothing to
 * inject are returned untouched.
 *
 * @param response - the response to rewrite
 * @param html - the markup to inject, e.g. the output of `getTraceMetaTags()`
 */
export function injectHtmlIntoHead(response: Response, html: string, options?: InjectHtmlIntoHeadOptions): Response {
  const contentType = response.headers.get('content-type');
  if (!html || !contentType?.startsWith('text/html') || !response.body) {
    return response;
  }

  const headers = new Headers(response.headers);
  // The body grows by the injected markup, so a copied content-length would truncate it.
  headers.delete('content-length');

  return new Response(injectHtmlIntoHeadStream(response.body, html, options), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
