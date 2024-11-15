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
 * Adds Sentry tracing instrumentation for the [lru-memoizer](https://www.npmjs.com/package/lru-memoizer) library.
 *
 * For more information, see the [`lruMemoizerIntegration` documentation](https://docs.sentry.io/platforms/javascript/guides/node/configuration/integrations/lrumemoizer/).
 *
 * @example
 * ```javascript
 * const Sentry = require('@sentry/node');
 *
 * Sentry.init({
 *  integrations: [Sentry.lruMemoizerIntegration()],
 * });
 */
export const lruMemoizerIntegration = defineIntegration(_lruMemoizerIntegration);
