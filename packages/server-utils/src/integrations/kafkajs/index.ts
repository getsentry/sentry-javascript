import * as diagnosticsChannel from 'node:diagnostics_channel';
import type { TracingChannelSubscribers } from 'node:diagnostics_channel';
import type { IntegrationFn, Span } from '@sentry/core';
import { defineIntegration } from '@sentry/core';
import { CHANNELS } from '../../orchestrion/channels';
import { kafkajsModuleNames } from '../../orchestrion/config/kafkajs';
import { invokeOrchestrionInstrumentation } from '../../orchestrion/instrumentation';
import { isWrappedConsumerCallback, wrapEachBatch, wrapEachMessage } from './consumer';
import { applyErrorToSpans, startProducerSpan } from './spans';
import type { ConsumerRunConfig, ProducerBatch } from './types';

// NOTE: this uses the same name as the OTel `Kafka` integration by design, so the OTel integration
// is deduplicated out of the default set.
const INTEGRATION_NAME = 'Kafka' as const;

/** The tracing-channel context the transform attaches around `messageProducer.js`'s `sendBatch`. */
interface SendBatchChannelContext {
  // `arguments[0]` is the `{ topicMessages }` batch (kafkajs normalizes `send` into `sendBatch`).
  arguments: [ProducerBatch?, ...unknown[]];
  error?: unknown;
  // The producer spans opened at `start`, ended on `asyncEnd` (and marked errored on `error`).
  _sentrySpans?: Span[];
}

/** The tracing-channel context the transform attaches around `consumer/index.js`'s `run`. */
interface ConsumerRunChannelContext {
  // `arguments[0]` is the `run(config)` config whose `eachMessage`/`eachBatch` we swap in place.
  arguments: [ConsumerRunConfig?, ...unknown[]];
}

function subscribeToProducer(): void {
  const channel = diagnosticsChannel.tracingChannel<SendBatchChannelContext>(CHANNELS.KAFKAJS_SEND_BATCH);
  // Node types `subscribe` as requiring every lifecycle handler; runtime accepts a partial set, so we
  // pass only the ones we use (matching `bindTracingChannelToSpan`'s handling in `tracing-channel.ts`).
  const subscribers: Partial<TracingChannelSubscribers<SendBatchChannelContext>> = {
    start(ctx) {
      const spans: Span[] = [];
      // `startProducerSpan` mutates each message's headers; doing it at `start` means the mutation
      // reaches the real call, propagating the producer's trace to consumers.
      (ctx.arguments[0]?.topicMessages ?? []).forEach(topicMessage => {
        topicMessage.messages.forEach(message => {
          spans.push(startProducerSpan(topicMessage.topic, message));
        });
      });
      ctx._sentrySpans = spans;
    },
    error(ctx) {
      if (ctx._sentrySpans) {
        applyErrorToSpans(ctx._sentrySpans, ctx.error);
      }
    },
    asyncEnd(ctx) {
      // `asyncEnd` fires on both success and failure; `error` (above) has already set the status.
      ctx._sentrySpans?.forEach(span => span.end());
    },
  };
  channel.subscribe(subscribers as TracingChannelSubscribers<SendBatchChannelContext>);
}

function subscribeToConsumer(): void {
  const channel = diagnosticsChannel.tracingChannel<ConsumerRunChannelContext>(CHANNELS.KAFKAJS_CONSUMER_RUN);
  const subscribers: Partial<TracingChannelSubscribers<ConsumerRunChannelContext>> = {
    start(ctx) {
      const config = ctx.arguments[0];
      if (!config || typeof config !== 'object') {
        return;
      }
      // Swap the user callbacks for span-creating wrappers before `run` destructures its config. The
      // `isWrappedConsumerCallback` guard keeps this idempotent: a config object reused across another
      // `run` (or a second consumer) must not have its wrapper wrapped again, which would double spans.
      if (typeof config.eachMessage === 'function' && !isWrappedConsumerCallback(config.eachMessage)) {
        config.eachMessage = wrapEachMessage(config.eachMessage);
      }
      if (typeof config.eachBatch === 'function' && !isWrappedConsumerCallback(config.eachBatch)) {
        config.eachBatch = wrapEachBatch(config.eachBatch);
      }
    },
  };
  channel.subscribe(subscribers as TracingChannelSubscribers<ConsumerRunChannelContext>);
}

const _kafkaIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      invokeOrchestrionInstrumentation(client, kafkajsModuleNames, instrumentKafkajs, [], {
        requiresTracingChannelBinding: false,
      });
    },
  };
}) satisfies IntegrationFn;

function instrumentKafkajs(): void {
  subscribeToProducer();
  subscribeToConsumer();
}

/**
 * Diagnostics-channel-based kafkajs integration.
 *
 * Subscribes to the `orchestrion:kafkajs:*` diagnostics_channels that Sentry's code transform
 * injects into `kafkajs`'s `producer/messageProducer.js` (`sendBatch`) and `consumer/index.js` (`run`).
 * Requires the Sentry runtime hook or bundler plugin to be active.
 *
 * Known limitation vs. the OTel integration it replaces: the wrapping producer-`transaction` span is
 * not emitted (the transformer can't replace `transaction()`'s return value to patch commit/abort).
 * Transactional `send`/`sendBatch` calls still produce producer spans, since they route through the
 * same instrumented `sendBatch`.
 */
export const kafkaIntegration = defineIntegration(_kafkaIntegration);
