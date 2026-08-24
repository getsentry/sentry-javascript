import {
  browserTracingIntegration as originalBrowserTracingIntegration,
  startBrowserTracingPageLoadSpan,
  WINDOW,
} from '@sentry/browser';
import type { Client, Integration, TransactionSource } from '@sentry/core';
import {
  browserPerformanceTimeOrigin,
  debug,
  hasSpanStreamingEnabled,
  PAGELOAD_SPAN_NAME_FALLBACK,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
} from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';
import { URL_TEMPLATE } from '@sentry/conventions/attributes';

/**
 * Returns the value of a meta-tag
 */
function getMetaContent(metaName: string): string | undefined {
  const optionalDocument = WINDOW.document as (typeof WINDOW)['document'] | undefined;
  const metaTag = optionalDocument?.querySelector(`meta[name=${metaName}]`);
  return metaTag?.getAttribute('content') || undefined;
}

/**
 * A custom browser tracing integrations for Astro.
 */
export function browserTracingIntegration(
  options: Parameters<typeof originalBrowserTracingIntegration>[0] = {},
): Integration {
  const integration = originalBrowserTracingIntegration({ ...options, instrumentPageLoad: false });

  return {
    ...integration,
    afterAllSetup(client) {
      // Original integration afterAllSetup call
      integration.afterAllSetup?.(client);

      if (WINDOW.location) {
        if (options.instrumentPageLoad != false) {
          const origin = browserPerformanceTimeOrigin();

          const { name, source } = getPageloadSpanName(client);

          startBrowserTracingPageLoadSpan(client, {
            name,
            // pageload should always start at timeOrigin (and needs to be in s, not ms)
            startTime: origin ? origin / 1000 : undefined,
            attributes: {
              [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: source,
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.pageload.astro',
              ...(source === 'route' && { [URL_TEMPLATE]: name }),
            },
          });
        }
      }
    },
  };
}

function getPageloadSpanName(client: Client): { name: string; source: TransactionSource } {
  try {
    const routeNameFromMetaTags = getMetaContent('sentry-route-name');
    if (routeNameFromMetaTags) {
      const decodedRouteName = decodeURIComponent(routeNameFromMetaTags);

      DEBUG_BUILD && debug.log(`[Tracing] Using route name from Sentry HTML meta-tag: ${decodedRouteName}`);

      return {
        name: decodedRouteName,
        source: 'route',
      };
    }
  } catch {
    // fail silently if decoding or reading the meta tag fails
  }
  return {
    // With span streaming, span names have to be low cardinality, so we can't fall back to the URL.
    name: hasSpanStreamingEnabled(client) ? PAGELOAD_SPAN_NAME_FALLBACK : WINDOW.location.pathname,
    source: 'url',
  };
}
