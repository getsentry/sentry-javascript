import { KafkaJsInstrumentation } from '@opentelemetry/instrumentation-kafkajs';

import { defineIntegration } from '@sentry/core';
import type { IntegrationFn } from '@sentry/types';
import { generateInstrumentOnce } from '../../otel/instrument';
import { addOriginToSpan } from '../../utils/addOriginToSpan';

const INTEGRATION_NAME = 'Kafka';

export const instrumentKafka = generateInstrumentOnce(
  INTEGRATION_NAME,
  () =>
    new KafkaJsInstrumentation({
      consumerHook(span) {
        addOriginToSpan(span, 'auto.kafkajs.otel.consumer');
      },
      producerHook(span) {
        addOriginToSpan(span, 'auto.kafkajs.otel.producer');
      },
    }),
);

const _kafkaIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      instrumentKafka();
    },
  };
}) satisfies IntegrationFn;

/**
 * KafkaJs integration
 *
 * Capture tracing data for KafkaJs.
 */
export const kafkaIntegration = defineIntegration(_kafkaIntegration);
