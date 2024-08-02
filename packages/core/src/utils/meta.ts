import type { Client, Scope, Span } from '@sentry/types';
import { getTraceData } from './traceData';

/**
 * Returns a string of meta tags that represent the tracing data.
 *
 * You can use this to propagate a trace from your server-side rendered Html to the browser.
 * Usage example:
 *
 * ```js
 * function renderHtml() {
 *   return `
 *     <head>
 *       ${getTracingMetaTags()}
 *     </head>
 *   `;
 * }
 * ```
 *
 * @returns
 */
export function getTracingMetaTags(span?: Span, scope?: Scope, client?: Client): string {
  return Object.entries(getTraceData(span, scope, client))
    .map(([key, value]) => `<meta name="${key}" content="${value}"/>`)
    .join('\n');
}
