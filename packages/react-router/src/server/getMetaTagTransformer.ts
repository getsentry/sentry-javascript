import type { PassThrough } from 'node:stream';
import { Transform } from 'node:stream';
import { getTraceMetaTags } from '@sentry/core';

/**
 * Injects Sentry trace meta tags into the HTML response by piping through a transform stream.
 * This enables distributed tracing by adding trace context to the HTML document head.
 *
 * @param body - PassThrough stream containing the HTML response body to modify
 */
export function getMetaTagTransformer(body: PassThrough): Transform {
  const headClosingTag = '</head>';
  // A single streaming decoder carries incomplete multi-byte sequences across chunk
  // boundaries. Decoding each chunk on its own (e.g. `Buffer.toString()`) would flush a
  // split character as U+FFFD, corrupting the response (see
  // https://github.com/whatwg/encoding/issues/184).
  const decoder = new TextDecoder();
  const htmlMetaTagTransformer = new Transform({
    transform(chunk, _encoding, callback) {
      const html = Buffer.isBuffer(chunk) ? decoder.decode(chunk, { stream: true }) : String(chunk);
      if (html.includes(headClosingTag)) {
        const modifiedHtml = html.replace(headClosingTag, `${getTraceMetaTags()}${headClosingTag}`);
        callback(null, modifiedHtml);
        return;
      }
      callback(null, html);
    },
  });
  htmlMetaTagTransformer.pipe(body);
  return htmlMetaTagTransformer;
}
