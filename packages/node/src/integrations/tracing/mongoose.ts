import { MongooseInstrumentation } from '@opentelemetry/instrumentation-mongoose';
import type { IntegrationFn } from '@sentry/core';
import { defineIntegration } from '@sentry/core';
import { addOriginToSpan, generateInstrumentOnce } from '@sentry/node-core';

const INTEGRATION_NAME = 'Mongoose';

export const instrumentMongoose = generateInstrumentOnce(
  INTEGRATION_NAME,
  () =>
    new MongooseInstrumentation({
      responseHook(span) {
        addOriginToSpan(span, 'auto.db.otel.mongoose');
      },
    }),
);

const _mongooseIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      instrumentMongoose();
    },
  };
}) satisfies IntegrationFn;

/**
 * Adds Sentry tracing instrumentation for the [mongoose](https://www.npmjs.com/package/mongoose) library.
 *
 * For more information, see the [`mongooseIntegration` documentation](https://docs.sentry.io/platforms/javascript/guides/node/configuration/integrations/mongoose/).
 *
 * @example
 * ```javascript
 * const Sentry = require('@sentry/node');
 *
 * Sentry.init({
 *  integrations: [Sentry.mongooseIntegration()],
 * });
 * ```
 */
export const mongooseIntegration = defineIntegration(_mongooseIntegration);
