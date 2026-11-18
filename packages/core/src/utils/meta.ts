import type { SerializedTraceData } from '../types/tracing';
import { getTraceData } from './traceData';

/**
 * Returns a string of meta tags that represent the current trace data.
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
export function getTraceMetaTags(traceData?: SerializedTraceData): string {
  return (
    Object.entries(traceData || getTraceData())
      .map(([key, value]) => `<meta name="${key}" content="${value}"/>`)
      // Joined without whitespace on purpose: a separator between the tags becomes a text node when
      // injected into `<head>`, which breaks React 19 whole-document hydration (#21915).
      .join('')
  );
}

/**
 * The name of the meta tag that gives the release to the browser SDK. Framework SDKs write it into each page
 * instead of injecting the release into the client chunks, where it would change their content hashes on every
 * release.
 */
export const RELEASE_META_TAG_NAME = 'sentry-release';

/**
 * Returns the meta tag that gives `release` to the browser SDK.
 */
export function getReleaseMetaTag(release: string): string {
  return `<meta name="${RELEASE_META_TAG_NAME}" content="${escapeHtmlAttribute(release)}"/>`;
}

function escapeHtmlAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
