import type { PassThrough } from 'node:stream';
import { Transform } from 'node:stream';
import { getTraceMetaTags } from '@sentry/core';
import { createHeadTagInjector } from './headTagInjector';

/**
 * Injects Sentry trace meta tags into the HTML response by piping through a transform stream.
 * This enables distributed tracing by adding trace context to the HTML document head.
 *
 * @param body - PassThrough stream containing the HTML response body to modify
 */
export function getMetaTagTransformer(body: PassThrough): Transform {
  // A single streaming decoder carries incomplete multi-byte sequences across chunk
  // boundaries. Decoding each chunk on its own (e.g. `Buffer.toString()`) would flush a
  // split character as U+FFFD, corrupting the response (see
  // https://github.com/whatwg/encoding/issues/184).
  const decoder = new TextDecoder();
  const injector = createHeadTagInjector(getTraceMetaTags);
  const htmlMetaTagTransformer = new Transform({
    transform(chunk, _encoding, callback) {
      const html = Buffer.isBuffer(chunk) ? decoder.decode(chunk, { stream: true }) : String(chunk);
      callback(null, injector.push(html));
    },
    flush(callback) {
      const out = injector.push(decoder.decode()) + injector.flush();
      callback(null, out);
    },
  });
  htmlMetaTagTransformer.pipe(body);
  return htmlMetaTagTransformer;
}
