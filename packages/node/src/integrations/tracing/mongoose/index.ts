import { MongooseInstrumentation } from './vendored/mongoose';
import type { IntegrationFn } from '@sentry/core';
import { defineIntegration, extendIntegration } from '@sentry/core';
import { generateInstrumentOnce } from '@sentry/node-core';
import { mongooseIntegration as mongooseChannelIntegration } from '@sentry/server-utils';

const INTEGRATION_NAME = 'Mongoose' as const;

export const instrumentMongoose = generateInstrumentOnce(INTEGRATION_NAME, () => new MongooseInstrumentation());

const _mongooseIntegration = (() => {
  // The diagnostics_channel subscription (mongoose >= 9.7) lives in server-utils so it is shared
  // across server runtimes; we extend it here to also run the IITM-based patcher for mongoose < 9.7.
  return extendIntegration(mongooseChannelIntegration(), {
    name: INTEGRATION_NAME,
    setupOnce() {
      instrumentMongoose();
    },
  });
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
