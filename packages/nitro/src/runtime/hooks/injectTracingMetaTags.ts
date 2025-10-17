import { debug } from '@sentry/core';
import type { H3Event } from 'h3';
import { addSentryTracingMetaTags } from '../utils/common';

/**
 * Injects Sentry tracing meta tags into the HTML response body.
 */
export function injectTracingMetaTags(event: H3Event, response: { body?: unknown }): void {
  const headers = event.node.res?.getHeaders() || {};
  const isPreRenderedPage = Object.keys(headers).includes('x-nitro-prerender');
  const isPageloadRequest = String(headers['content-type']).startsWith('text/html');
  if (!isPageloadRequest) {
    return;
  }

  if (!isPreRenderedPage) {
    addSentryTracingMetaTags(response);
  } else {
    const reason = isPreRenderedPage ? 'the page was pre-rendered' : 'SWR caching is enabled for the route';
    debug.log(
      `Not adding Sentry tracing meta tags to HTML for ${event.path} because ${reason}. This will disable distributed tracing and prevent connecting multiple client page loads to the same server request.`,
    );
  }
}
