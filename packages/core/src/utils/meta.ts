import type { Client, Scope, Span } from '@sentry/types';
import { getTraceData } from './traceData';

// Function overloads
export function getTraceMetaTags(params?: { span?: Span; scope?: Scope; client?: Client; asArray: true }): string[];
export function getTraceMetaTags(params?: { span?: Span; scope?: Scope; client?: Client; asArray?: false }): string;
/**
 * Returns a string or string[] of meta tags that represent the current trace data.
 *
 * You can use this to propagate a trace from your server-side rendered Html to the browser.
 * This function returns up to two meta tags, `sentry-trace` and `baggage`, depending on the
 * current trace data state.
 *
 * @example
 * Usage example:
 *
 * ```js
 * function renderHtml() {
 *   return `
 *     <head>
 *       ${getTraceMetaTags()}
 *     </head>
 *   `;
 * }
 * ```
 *
 */
export function getTraceMetaTags({
  span,
  scope,
  client,
  asArray,
}: { span?: Span; scope?: Scope; client?: Client; asArray?: boolean } = {}): string | string[] {
  const traceTags = Object.entries(getTraceData(span, scope, client)).map(
    ([key, value]) => `<meta name="${key}" content="${value}"/>`,
  );

  return asArray ? traceTags : traceTags.join('\n');
}
