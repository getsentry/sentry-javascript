import { MongoDBInstrumentation } from '@opentelemetry/instrumentation-mongodb';
import { defineIntegration } from '@sentry/core';
import type { IntegrationFn } from '@sentry/types';
import { generateInstrumentOnce } from '../../otel/instrument';

import { addOriginToSpan } from '../../utils/addOriginToSpan';

const INTEGRATION_NAME = 'Mongo';

export const instrumentMongo = generateInstrumentOnce(
  INTEGRATION_NAME,
  () =>
    new MongoDBInstrumentation({
      responseHook(span) {
        addOriginToSpan(span, 'auto.db.otel.mongo');
      },
    }),
);

const _mongoIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      instrumentMongo();
    },
  };
}) satisfies IntegrationFn;

/**
 * Adds Sentry tracing instrumentation for the [mongodb](https://www.npmjs.com/package/mongodb) library.
 *
 * For more information, see the [`mongoIntegration` documentation](https://docs.sentry.io/platforms/javascript/guides/node/configuration/integrations/mongo/).
 *
 * @example
 * ```javascript
 * const Sentry = require('@sentry/node');
 *
 * Sentry.init({
 *  integrations: [Sentry.mongoIntegration()],
 * });
 * ```
 */
export const mongoIntegration = defineIntegration(_mongoIntegration);
