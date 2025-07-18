import type { Span } from '@opentelemetry/api';
import { type AmqplibInstrumentationConfig, AmqplibInstrumentation } from '@opentelemetry/instrumentation-amqplib';
import type { IntegrationFn } from '@sentry/core';
import { defineIntegration } from '@sentry/core';
import { addOriginToSpan, generateInstrumentOnce } from '@sentry/node-core';

const INTEGRATION_NAME = 'Amqplib';

const config: AmqplibInstrumentationConfig = {
  consumeEndHook: (span: Span) => {
    addOriginToSpan(span, 'auto.amqplib.otel.consumer');
  },
  publishHook: (span: Span) => {
    addOriginToSpan(span, 'auto.amqplib.otel.publisher');
  },
};

export const instrumentAmqplib = generateInstrumentOnce(INTEGRATION_NAME, () => new AmqplibInstrumentation(config));

const _amqplibIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      instrumentAmqplib();
    },
  };
}) satisfies IntegrationFn;

/**
 * Adds Sentry tracing instrumentation for the [amqplib](https://www.npmjs.com/package/amqplib) library.
 *
 * For more information, see the [`amqplibIntegration` documentation](https://docs.sentry.io/platforms/javascript/guides/node/configuration/integrations/amqplib/).
 *
 * @example
 * ```javascript
 * const Sentry = require('@sentry/node');
 *
 * Sentry.init({
 *  integrations: [Sentry.amqplibIntegration()],
 * });
 * ```
 */
export const amqplibIntegration = defineIntegration(_amqplibIntegration);
