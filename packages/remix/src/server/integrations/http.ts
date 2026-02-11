import type { IntegrationFn } from '@sentry/core';
import { httpIntegration as originalHttpIntegration } from '@sentry/node';

type HttpOptions = Parameters<typeof originalHttpIntegration>[0];

/**
 * The http integration instruments Node's internal http and https modules.
 * It creates breadcrumbs and spans for outgoing HTTP requests which will be attached to the currently active span.
 */
export const httpIntegration = ((options: HttpOptions = {}) => {
  return originalHttpIntegration({
    ...options,
    // We disable incoming request spans here, because otherwise we'd end up with duplicate spans.
    disableIncomingRequestSpans: true,
  });
}) satisfies IntegrationFn;
