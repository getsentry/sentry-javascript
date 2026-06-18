import { KnexInstrumentation } from './vendored/instrumentation';
import type { IntegrationFn } from '@sentry/core';
import { defineIntegration } from '@sentry/core';
import { generateInstrumentOnce } from '@sentry/node-core';

const INTEGRATION_NAME = 'Knex';

export const instrumentKnex = generateInstrumentOnce(INTEGRATION_NAME, () => new KnexInstrumentation());

const _knexIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      instrumentKnex();
    },
  };
}) satisfies IntegrationFn;

/**
 * Knex integration
 *
 * Capture tracing data for [Knex](https://knexjs.org/).
 *
 * @example
 * ```javascript
 * import * as Sentry from '@sentry/node';
 *
 * Sentry.init({
 *  integrations: [Sentry.knexIntegration()],
 * });
 * ```
 */
export const knexIntegration = defineIntegration(_knexIntegration);
