import {
  browserTracingIntegration as originalBrowserTracingIntegration,
  startBrowserTracingPageLoadSpan,
  WINDOW,
} from '@sentry/browser';
import type { Integration, TransactionSource } from '@sentry/core';
import {
  browserPerformanceTimeOrigin,
  debug,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
} from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';

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

          const { name, source } = getPageloadSpanName();

          startBrowserTracingPageLoadSpan(client, {
            name,
            // pageload should always start at timeOrigin (and needs to be in s, not ms)
            startTime: origin ? origin / 1000 : undefined,
            attributes: {
              [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: source,
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.pageload.astro',
            },
          });
        }
      }
    },
  };
}

function getPageloadSpanName(): { name: string; source: TransactionSource } {
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
    name: WINDOW.location.pathname,
    source: 'url',
  };
}
