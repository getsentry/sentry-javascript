import type { Span } from '@opentelemetry/api';
import { AmqplibInstrumentation, type AmqplibInstrumentationConfig } from '@opentelemetry/instrumentation-amqplib';
import { defineIntegration } from '@sentry/core';
import type { IntegrationFn } from '@sentry/types';
import { generateInstrumentOnce } from '../../otel/instrument';
import { addOriginToSpan } from '../../utils/addOriginToSpan';

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

export const amqplibIntegration = defineIntegration(_amqplibIntegration);
