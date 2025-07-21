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
  const htmlMetaTagTransformer = new Transform({
    transform(chunk, _encoding, callback) {
      const html = Buffer.isBuffer(chunk) ? chunk.toString() : String(chunk);
      if (html.includes(headClosingTag)) {
        const modifiedHtml = html.replace(headClosingTag, `${getTraceMetaTags()}${headClosingTag}`);
        callback(null, modifiedHtml);
        return;
      }
      callback(null, chunk);
    },
  });
  htmlMetaTagTransformer.pipe(body);
  return htmlMetaTagTransformer;
}
