import type { Span } from '@opentelemetry/api';
import type { IntegrationFn } from '@sentry/core';
import { defineIntegration } from '@sentry/core';
import { addOriginToSpan, generateInstrumentOnce } from '@sentry/node-core';
import { ClickHouseInstrumentation } from './instrumentation'

const INTEGRATION_NAME = 'Clickhouse';

export const instrumentClickhouse = generateInstrumentOnce(
  INTEGRATION_NAME,
  () =>
    new ClickHouseInstrumentation({
      responseHook(span: Span) {
        addOriginToSpan(span, 'auto.db.otel.clickhouse');
      },
    }),
);

const _clickhouseIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      instrumentClickhouse();
    },
  };
}) satisfies IntegrationFn;

/**
 * Adds Sentry tracing instrumentation for the [ClickHouse](https://www.npmjs.com/package/@clickhouse/client) library.
 *
 * @example
 * ```javascript
 * const Sentry = require('@sentry/node');
 *
 * Sentry.init({
 *   integrations: [Sentry.clickhouseIntegration()],
 * });
 * ```
 */
export const clickhouseIntegration = defineIntegration(_clickhouseIntegration);
