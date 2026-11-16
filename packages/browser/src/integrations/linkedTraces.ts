import { isBotUserAgent } from '@sentry/browser-utils';
import type { IntegrationFn } from '@sentry/core';
import { defineIntegration } from '@sentry/core';
import { linkTraces } from '../tracing/linkedTraces';

interface LinkedTracesOptions {
  /**
   * Where the previous trace is stored: `'in-memory'` for single-page applications, or
   * `'session-storage'` for multi-page applications, which writes to the browser's `sessionStorage`.
   *
   * Default: 'in-memory'
   */
  storage?: 'in-memory' | 'session-storage';

  /**
   * If true, subsequent traces are sampled consistently with the sampling decision of the initial trace.
   *
   * Default: false
   */
  consistentTraceSampling?: boolean;
}

const _linkedTracesIntegration = ((options: LinkedTracesOptions = {}) => {
  const { storage = 'in-memory', consistentTraceSampling = false } = options;

  return {
    name: 'LinkedTraces',
    setup(client) {
      if (isBotUserAgent()) {
        return;
      }

      linkTraces(client, { linkPreviousTrace: storage, consistentTraceSampling });
    },
  };
}) satisfies IntegrationFn;

/**
 * Links each new trace to the previous one, so you can navigate between traces in Sentry.
 */
export const linkedTracesIntegration = defineIntegration(_linkedTracesIntegration);
