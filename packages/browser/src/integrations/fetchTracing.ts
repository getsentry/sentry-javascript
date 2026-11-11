import type { IntegrationFn } from '@sentry/core';
import { defineIntegration } from '@sentry/core';
import type { RequestInstrumentationOptions } from '../tracing/request';
import { instrumentFetchRequests } from '../tracing/request';

const INTEGRATION_NAME = 'FetchTracing';

type FetchTracingOptions = Partial<
  Pick<
    RequestInstrumentationOptions,
    'shouldCreateSpanForRequest' | 'enableHTTPTimings' | 'onRequestSpanStart' | 'onRequestSpanEnd'
  >
>;

const _fetchTracingIntegration = ((options: FetchTracingOptions = {}) => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      instrumentFetchRequests(client, {
        ...options,
        tracePropagationTargets: client.getOptions().tracePropagationTargets,
      });
    },
  };
}) satisfies IntegrationFn;

/**
 * Creates spans for outgoing fetch requests and attaches trace propagation headers to them.
 */
export const fetchTracingIntegration = defineIntegration(_fetchTracingIntegration);
