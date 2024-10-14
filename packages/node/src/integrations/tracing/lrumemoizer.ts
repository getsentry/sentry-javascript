import { LruMemoizerInstrumentation } from '@opentelemetry/instrumentation-lru-memoizer';

import { defineIntegration } from '@sentry/core';
import type { IntegrationFn } from '@sentry/types';
import { generateInstrumentOnce } from '../../otel/instrument';

const INTEGRATION_NAME = 'LruMemoizer';

export const instrumentLruMemoizer = generateInstrumentOnce(INTEGRATION_NAME, () => new LruMemoizerInstrumentation());

const _lruMemoizerIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      instrumentLruMemoizer();
    },
  };
}) satisfies IntegrationFn;

/**
 * LruMemoizer integration
 *
 * Propagate traces through LruMemoizer.
 */
export const lruMemoizerIntegration = defineIntegration(_lruMemoizerIntegration);
