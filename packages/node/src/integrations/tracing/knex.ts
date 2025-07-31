import { KnexInstrumentation } from '@opentelemetry/instrumentation-knex';
import type { IntegrationFn } from '@sentry/core';
import { defineIntegration, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, spanToJSON } from '@sentry/core';
import { generateInstrumentOnce, instrumentWhenWrapped } from '@sentry/node-core';

const INTEGRATION_NAME = 'Knex';

export const instrumentKnex = generateInstrumentOnce(
  INTEGRATION_NAME,
  () => new KnexInstrumentation({ requireParentSpan: true }),
);

const _knexIntegration = (() => {
  let instrumentationWrappedCallback: undefined | ((callback: () => void) => void);

  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      const instrumentation = instrumentKnex();
      instrumentationWrappedCallback = instrumentWhenWrapped(instrumentation);
    },

    setup(client) {
      instrumentationWrappedCallback?.(() =>
        client.on('spanStart', span => {
          const { data } = spanToJSON(span);
          // knex.version is always set in the span data
          // https://github.com/open-telemetry/opentelemetry-js-contrib/blob/0309caeafc44ac9cb13a3345b790b01b76d0497d/plugins/node/opentelemetry-instrumentation-knex/src/instrumentation.ts#L138
          if ('knex.version' in data) {
            span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, 'auto.db.otel.knex');
          }
        }),
      );
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
