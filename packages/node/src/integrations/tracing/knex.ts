import { KnexInstrumentation } from '@opentelemetry/instrumentation-knex';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, defineIntegration, spanToJSON } from '@sentry/core';
import type { IntegrationFn } from '@sentry/types';
import { generateInstrumentOnce } from '../../otel/instrument';

const INTEGRATION_NAME = 'Knex';

export const instrumentKnex = generateInstrumentOnce(
  INTEGRATION_NAME,
  () => new KnexInstrumentation({ requireParentSpan: true }),
);

const _knexIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      instrumentKnex();
    },

    setup(client) {
      client.on('spanStart', span => {
        const { data } = spanToJSON(span);
        // knex.version is always set in the span data
        // https://github.com/open-telemetry/opentelemetry-js-contrib/blob/0309caeafc44ac9cb13a3345b790b01b76d0497d/plugins/node/opentelemetry-instrumentation-knex/src/instrumentation.ts#L138
        if (data && 'knex.version' in data) {
          span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, 'auto.db.otel.knex');
        }
      });
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
