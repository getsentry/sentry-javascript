import type { IntegrationFn } from '@sentry/core';
import { defineIntegration } from '@sentry/core';
import { invokeOrchestrionInstrumentation } from '../../../orchestrion/instrumentation';
import { instrumentKafkajs } from './instrumentation';
import { kafkajsModuleNames } from '../../../orchestrion/config/kafkajs';

const INTEGRATION_NAME = 'Kafka' as const;

const _kafkajsChannelIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      invokeOrchestrionInstrumentation(client, kafkajsModuleNames, instrumentKafkajs, []);
    },
  };
}) satisfies IntegrationFn;

/**
 * EXPERIMENTAL — orchestrion-driven kafkajs integration.
 *
 * Subscribes to the `orchestrion:kafkajs:*` diagnostics_channels that the orchestrion code transform
 * injects into `kafkajs`'s `producer/messageProducer.js` (`sendBatch`) and `consumer/index.js` (`run`).
 * Requires the orchestrion runtime hook or bundler plugin to be active — wire that up via
 * `experimentalUseDiagnosticsChannelInjection`.
 *
 * Known limitation vs. the OTel integration it replaces: the wrapping producer-`transaction` span is
 * not emitted (the transformer can't replace `transaction()`'s return value to patch commit/abort).
 * Transactional `send`/`sendBatch` calls still produce producer spans, since they route through the
 * same instrumented `sendBatch`.
 */
export const kafkajsChannelIntegration = defineIntegration(_kafkajsChannelIntegration);
