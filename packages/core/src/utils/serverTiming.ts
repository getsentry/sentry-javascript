import type { SerializedTraceData } from '../types/tracing';
import { getTraceData } from './traceData';

/**
 * Returns the value of a `Server-Timing` response header that carries the current trace data.
 *
 * The browser SDK reads it off the document response to continue the trace of the server request in
 * the pageload span. Unlike the meta tags of `getTraceMetaTags`, the header reaches the browser before
 * any HTML, so the pageload never has to wait for a tag. The value holds up to two entries,
 * `sentry-trace` and `baggage`, and is empty without trace data.
 *
 * @example
 * ```js
 * response.setHeader('Server-Timing', getTraceServerTimingHeader());
 * ```
 */
export function getTraceServerTimingHeader(traceData?: SerializedTraceData): string {
  return Object.entries(traceData || getTraceData())
    .map(([key, value]) => `${key};desc="${value}"`)
    .join(', ');
}
