/*
 * Copyright The OpenTelemetry Authors, Aspecto
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-kafkajs
 * - Upstream version: @opentelemetry/instrumentation-kafkajs@0.27.0
 * - Some types vendored from kafkajs with simplifications
 * - Refactored to use Sentry's span APIs instead of OpenTelemetry tracing APIs
 * - Cross-broker trace propagation uses Sentry's `getTraceData`/`continueTrace` instead of the OTel
 *   propagator, so the vendored `bufferTextMapGetter` propagator is gone
 * - Dropped the OTel metrics (no MeterProvider is wired up) and, with them, the `network.request`
 *   event listeners they relied on; origin is folded into span creation instead of `index.ts` hooks
 */

import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
import { InstrumentationBase, InstrumentationNodeModuleDefinition, isWrapped } from '@opentelemetry/instrumentation';
import type { Span } from '@sentry/core';
import {
  continueTrace,
  SDK_VERSION,
  SPAN_STATUS_ERROR,
  SPAN_STATUS_OK,
  startInactiveSpan,
  startNewTrace,
  withActiveSpan,
} from '@sentry/core';
import type {
  Consumer,
  ConsumerRunConfig,
  EachBatchHandler,
  EachMessageHandler,
  Kafka,
  KafkaMessage,
  Producer,
  RecordMetadata,
  Transaction,
} from './kafkajs-types';
import {
  ATTR_MESSAGING_BATCH_MESSAGE_COUNT,
  ATTR_MESSAGING_DESTINATION_PARTITION_ID,
  MESSAGING_OPERATION_TYPE_VALUE_PROCESS,
  MESSAGING_OPERATION_TYPE_VALUE_RECEIVE,
} from './semconv';
import {
  endSpansOnPromise,
  getHeaderAsString,
  getLinksFromHeaders,
  startConsumerSpan,
  startProducerSpan,
} from './utils';

const PACKAGE_NAME = '@sentry/instrumentation-kafkajs';

export class KafkaJsInstrumentation extends InstrumentationBase<InstrumentationConfig> {
  public constructor(config: InstrumentationConfig = {}) {
    super(PACKAGE_NAME, SDK_VERSION, config);
  }

  protected init(): InstrumentationNodeModuleDefinition {
    const unpatch = (moduleExports: any): void => {
      if (isWrapped(moduleExports?.Kafka?.prototype.producer)) {
        this._unwrap(moduleExports.Kafka.prototype, 'producer');
      }
      if (isWrapped(moduleExports?.Kafka?.prototype.consumer)) {
        this._unwrap(moduleExports.Kafka.prototype, 'consumer');
      }
    };

    const module = new InstrumentationNodeModuleDefinition(
      'kafkajs',
      ['>=0.3.0 <3'],
      (moduleExports: any) => {
        unpatch(moduleExports);
        this._wrap(moduleExports?.Kafka?.prototype, 'producer', this._getProducerPatch());
        this._wrap(moduleExports?.Kafka?.prototype, 'consumer', this._getConsumerPatch());

        return moduleExports;
      },
      unpatch,
    );
    return module;
  }

  private _getConsumerPatch() {
    const instrumentation = this;
    return (original: Kafka['consumer']) => {
      return function consumer(this: Kafka, ...args: Parameters<Kafka['consumer']>) {
        const newConsumer: Consumer = original.apply(this, args);

        // oxlint-disable-next-line typescript/unbound-method -- property check, the method is never called
        if (isWrapped(newConsumer.run)) {
          instrumentation._unwrap(newConsumer, 'run');
        }

        instrumentation._wrap(newConsumer, 'run', instrumentation._getConsumerRunPatch());

        return newConsumer;
      };
    };
  }

  private _getProducerPatch() {
    const instrumentation = this;
    return (original: Kafka['producer']) => {
      return function consumer(this: Kafka, ...args: Parameters<Kafka['producer']>) {
        const newProducer: Producer = original.apply(this, args);

        // oxlint-disable-next-line typescript/unbound-method -- property check, the method is never called
        if (isWrapped(newProducer.sendBatch)) {
          instrumentation._unwrap(newProducer, 'sendBatch');
        }
        instrumentation._wrap(newProducer, 'sendBatch', instrumentation._getSendBatchPatch());

        // oxlint-disable-next-line typescript/unbound-method -- property check, the method is never called
        if (isWrapped(newProducer.send)) {
          instrumentation._unwrap(newProducer, 'send');
        }
        instrumentation._wrap(newProducer, 'send', instrumentation._getSendPatch());

        // oxlint-disable-next-line typescript/unbound-method -- property check, the method is never called
        if (isWrapped(newProducer.transaction)) {
          instrumentation._unwrap(newProducer, 'transaction');
        }
        instrumentation._wrap(newProducer, 'transaction', instrumentation._getProducerTransactionPatch());

        return newProducer;
      };
    };
  }

  private _getConsumerRunPatch() {
    const instrumentation = this;
    return (original: Consumer['run']) => {
      return function run(this: Consumer, ...args: Parameters<Consumer['run']>): ReturnType<Consumer['run']> {
        const config = args[0];
        if (config?.eachMessage) {
          if (isWrapped(config.eachMessage)) {
            instrumentation._unwrap(config, 'eachMessage');
          }
          instrumentation._wrap(config, 'eachMessage', instrumentation._getConsumerEachMessagePatch());
        }
        if (config?.eachBatch) {
          if (isWrapped(config.eachBatch)) {
            instrumentation._unwrap(config, 'eachBatch');
          }
          instrumentation._wrap(config, 'eachBatch', instrumentation._getConsumerEachBatchPatch());
        }
        return original.call(this, config);
      };
    };
  }

  private _getConsumerEachMessagePatch() {
    return (original: ConsumerRunConfig['eachMessage']) => {
      return function eachMessage(this: unknown, ...args: Parameters<EachMessageHandler>): Promise<void> {
        const payload = args[0];
        const sentryTrace = getHeaderAsString(payload.message.headers, 'sentry-trace');
        const baggage = getHeaderAsString(payload.message.headers, 'baggage');

        // Continue the producer's trace so the consumer span is parented to the message's producer.
        return continueTrace({ sentryTrace, baggage }, () => {
          const span = startConsumerSpan({
            topic: payload.topic,
            message: payload.message,
            operationType: MESSAGING_OPERATION_TYPE_VALUE_PROCESS,
            attributes: {
              [ATTR_MESSAGING_DESTINATION_PARTITION_ID]: String(payload.partition),
            },
          });

          const eachMessagePromise = withActiveSpan(span, () => {
            return original!.apply(this, args);
          });
          return endSpansOnPromise([span], eachMessagePromise);
        });
      };
    };
  }

  private _getConsumerEachBatchPatch() {
    return (original: ConsumerRunConfig['eachBatch']) => {
      return function eachBatch(this: unknown, ...args: Parameters<EachBatchHandler>): Promise<void> {
        const payload = args[0];
        // https://github.com/open-telemetry/opentelemetry-specification/blob/master/specification/trace/semantic_conventions/messaging.md#topic-with-multiple-consumers
        // A batch pull aggregates messages from many producers, so the receiving span is a fresh root
        // trace and each processed message links back to its own producer span.
        const receivingSpan = startNewTrace(() =>
          startConsumerSpan({
            topic: payload.batch.topic,
            message: undefined,
            operationType: MESSAGING_OPERATION_TYPE_VALUE_RECEIVE,
            attributes: {
              [ATTR_MESSAGING_BATCH_MESSAGE_COUNT]: payload.batch.messages.length,
              [ATTR_MESSAGING_DESTINATION_PARTITION_ID]: String(payload.batch.partition),
            },
          }),
        );

        return withActiveSpan(receivingSpan, () => {
          const spans: Span[] = [receivingSpan];
          payload.batch.messages.forEach((message: KafkaMessage) => {
            spans.push(
              startConsumerSpan({
                topic: payload.batch.topic,
                message,
                operationType: MESSAGING_OPERATION_TYPE_VALUE_PROCESS,
                links: getLinksFromHeaders(message.headers),
                attributes: {
                  [ATTR_MESSAGING_DESTINATION_PARTITION_ID]: String(payload.batch.partition),
                },
              }),
            );
          });
          const batchMessagePromise: Promise<void> = original!.apply(this, args);
          return endSpansOnPromise(spans, batchMessagePromise);
        });
      };
    };
  }

  private _getProducerTransactionPatch() {
    const instrumentation = this;
    return (original: Producer['transaction']) => {
      return function transaction(
        this: Producer,
        ...args: Parameters<Producer['transaction']>
      ): ReturnType<Producer['transaction']> {
        const transactionSpan = startInactiveSpan({ name: 'transaction' });

        const transactionPromise = original.apply(this, args);

        transactionPromise
          .then((transaction: Transaction) => {
            // oxlint-disable-next-line typescript/unbound-method -- re-bound below via `.apply(this, args)`
            const originalSend = transaction.send;
            transaction.send = function send(this: Transaction, ...args) {
              return withActiveSpan(transactionSpan, () => {
                const patched = instrumentation._getSendPatch()(originalSend);
                return patched.apply(this, args).catch((err: any) => {
                  transactionSpan.setStatus({
                    code: SPAN_STATUS_ERROR,
                    message: err?.message,
                  });
                  throw err;
                });
              });
            };

            // oxlint-disable-next-line typescript/unbound-method -- re-bound below via `.apply(this, args)`
            const originalSendBatch = transaction.sendBatch;
            transaction.sendBatch = function sendBatch(this: Transaction, ...args) {
              return withActiveSpan(transactionSpan, () => {
                const patched = instrumentation._getSendBatchPatch()(originalSendBatch);
                return patched.apply(this, args).catch((err: any) => {
                  transactionSpan.setStatus({
                    code: SPAN_STATUS_ERROR,
                    message: err?.message,
                  });
                  throw err;
                });
              });
            };

            // oxlint-disable-next-line typescript/unbound-method -- re-bound below via `.apply(this, args)`
            const originalCommit = transaction.commit;
            transaction.commit = function commit(this: Transaction, ...args) {
              const originCommitPromise = originalCommit.apply(this, args).then(() => {
                transactionSpan.setStatus({ code: SPAN_STATUS_OK });
              });
              return endSpansOnPromise([transactionSpan], originCommitPromise);
            };

            // oxlint-disable-next-line typescript/unbound-method -- re-bound below via `.apply(this, args)`
            const originalAbort = transaction.abort;
            transaction.abort = function abort(this: Transaction, ...args) {
              const originAbortPromise = originalAbort.apply(this, args);
              return endSpansOnPromise([transactionSpan], originAbortPromise);
            };
          })
          .catch((err: any) => {
            transactionSpan.setStatus({
              code: SPAN_STATUS_ERROR,
              message: err?.message,
            });
            transactionSpan.end();
          });

        return transactionPromise;
      };
    };
  }

  private _getSendBatchPatch() {
    return (original: Producer['sendBatch'] | Transaction['sendBatch']) => {
      return function sendBatch(
        this: Producer | Transaction,
        ...args: Parameters<Producer['sendBatch']>
      ): ReturnType<Producer['sendBatch']> {
        const batch = args[0];
        const messages = batch.topicMessages || [];

        const spans: Span[] = [];

        messages.forEach((topicMessage: any) => {
          topicMessage.messages.forEach((message: any) => {
            spans.push(startProducerSpan(topicMessage.topic, message));
          });
        });
        const origSendResult: Promise<RecordMetadata[]> = original.apply(this, args);
        return endSpansOnPromise(spans, origSendResult);
      };
    };
  }

  private _getSendPatch() {
    return (original: Producer['send'] | Transaction['send']) => {
      return function send(
        this: Producer | Transaction,
        ...args: Parameters<Producer['send']>
      ): ReturnType<Producer['send']> {
        const record = args[0];
        const spans: Span[] = record.messages.map((message: any) => {
          return startProducerSpan(record.topic, message);
        });

        const origSendResult: Promise<RecordMetadata[]> = original.apply(this, args);
        return endSpansOnPromise(spans, origSendResult);
      };
    };
  }
}
