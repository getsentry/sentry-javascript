import { browserTracingIntegration as originalBrowserTracingIntegration, WINDOW } from '@sentry/browser';
import type { Integration, TransactionSource } from '@sentry/core';
import { debug, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, SEMANTIC_ATTRIBUTE_SENTRY_SOURCE } from '@sentry/core';
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
  const integration = originalBrowserTracingIntegration(options);

  return {
    ...integration,
    setup(client) {
      // Original integration setup call
      integration.setup?.(client);

      client.on('afterStartPageLoadSpan', pageLoadSpan => {
        const routeNameFromMetaTags = getMetaContent('sentry-route-name');

        if (routeNameFromMetaTags) {
          let decodedRouteName;
          try {
            decodedRouteName = decodeURIComponent(routeNameFromMetaTags);
          } catch {
            // We ignore errors here, e.g. if the value cannot be URL decoded.
            return;
          }

          DEBUG_BUILD && debug.log(`[Tracing] Using route name from Sentry HTML meta-tag: ${decodedRouteName}`);

          pageLoadSpan.updateName(decodedRouteName);
          pageLoadSpan.setAttributes({
            [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route' as TransactionSource,
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.pageload.astro',
          });
        }
      });
    },
  };
}
