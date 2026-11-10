import type { IntegrationFn } from '@sentry/core';
import { defineIntegration } from '@sentry/core';
import type { RequestInstrumentationOptions } from '../tracing/request';
import { instrumentXhrRequests } from '../tracing/request';

const INTEGRATION_NAME = 'XhrTracing';

type XhrTracingOptions = Partial<
  Pick<
    RequestInstrumentationOptions,
    'shouldCreateSpanForRequest' | 'enableHTTPTimings' | 'onRequestSpanStart' | 'onRequestSpanEnd'
  >
>;

const _xhrTracingIntegration = ((options: XhrTracingOptions = {}) => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      instrumentXhrRequests(client, {
        ...options,
        tracePropagationTargets: client.getOptions().tracePropagationTargets,
      });
    },
  };
}) satisfies IntegrationFn;

/**
 * Creates spans for outgoing XHR requests and attaches trace propagation headers to them.
 */
export const xhrTracingIntegration = defineIntegration(_xhrTracingIntegration);
