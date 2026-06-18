/*
 * Copyright The OpenTelemetry Authors, Aspecto
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-kafkajs
 * - Upstream version: @opentelemetry/instrumentation-kafkajs@0.27.0
 * - Some types vendored from kafkajs with simplifications
 * - Minor TypeScript strictness adjustments for this repository's compiler settings
 */
/* eslint-disable */

import {
  Attributes,
  Context,
  context,
  Counter,
  Histogram,
  Link,
  propagation,
  ROOT_CONTEXT,
  Span,
  SpanKind,
  SpanStatusCode,
  trace,
} from '@opentelemetry/api';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  isWrapped,
  safeExecuteInTheMiddle,
} from '@opentelemetry/instrumentation';
import { ERROR_TYPE_VALUE_OTHER } from '@opentelemetry/semantic-conventions';
import {
  ERROR_TYPE,
  MESSAGING_BATCH_MESSAGE_COUNT,
  MESSAGING_DESTINATION_NAME,
  MESSAGING_OPERATION_NAME,
  MESSAGING_OPERATION_TYPE,
  MESSAGING_SYSTEM,
  SERVER_ADDRESS,
  SERVER_PORT,
} from '@sentry/conventions/attributes';
import type { Kafka, Transaction, Producer, ConsumerEvents, ProducerEvents, RequestEvent } from './kafkajs-types';
import type {
  Consumer,
  ConsumerRunConfig,
  EachBatchHandler,
  EachMessageHandler,
  KafkaMessage,
  Message,
  RecordMetadata,
} from './kafkajs-types';
import { EVENT_LISTENERS_SET } from './internal-types';
import { bufferTextMapGetter } from './propagator';
import {
  ATTR_MESSAGING_DESTINATION_PARTITION_ID,
  ATTR_MESSAGING_KAFKA_MESSAGE_KEY,
  ATTR_MESSAGING_KAFKA_MESSAGE_TOMBSTONE,
  ATTR_MESSAGING_KAFKA_OFFSET,
  MESSAGING_OPERATION_TYPE_VALUE_PROCESS,
  MESSAGING_OPERATION_TYPE_VALUE_RECEIVE,
  MESSAGING_OPERATION_TYPE_VALUE_SEND,
  MESSAGING_SYSTEM_VALUE_KAFKA,
  METRIC_MESSAGING_CLIENT_CONSUMED_MESSAGES,
  METRIC_MESSAGING_CLIENT_OPERATION_DURATION,
  METRIC_MESSAGING_CLIENT_SENT_MESSAGES,
  METRIC_MESSAGING_PROCESS_DURATION,
} from './semconv';
import { KafkaJsInstrumentationConfig } from './types';

interface ConsumerSpanOptions {
  topic: string;
  message: KafkaMessage | undefined;
  operationType: string;
  attributes: Attributes;
  ctx?: Context | undefined;
  link?: Link;
}
import { SDK_VERSION } from '@sentry/core';

const PACKAGE_NAME = '@sentry/instrumentation-kafkajs';

// This interface acts as a strict subset of the KafkaJS Consumer and
// Producer interfaces (just for the event we're needing)
interface KafkaEventEmitter {
  on(eventName: ConsumerEvents['REQUEST'] | ProducerEvents['REQUEST'], listener: (event: RequestEvent) => void): void;
  events: {
    REQUEST: ConsumerEvents['REQUEST'] | ProducerEvents['REQUEST'];
  };
  [EVENT_LISTENERS_SET]?: boolean;
}

interface StandardAttributes<OP extends string = string> extends Attributes {
  [MESSAGING_SYSTEM]: string;
  [MESSAGING_OPERATION_NAME]: OP;
  [ERROR_TYPE]?: string;
}
interface TopicAttributes {
  [MESSAGING_DESTINATION_NAME]: string;
  [ATTR_MESSAGING_DESTINATION_PARTITION_ID]?: string;
}

interface ClientDurationAttributes extends StandardAttributes, Partial<TopicAttributes> {
  [SERVER_ADDRESS]: string;
  [SERVER_PORT]: number;
  [MESSAGING_OPERATION_TYPE]?: string;
}
interface SentMessagesAttributes extends StandardAttributes<'send'>, TopicAttributes {
  [ERROR_TYPE]?: string;
}
type ConsumedMessagesAttributes = StandardAttributes<'receive' | 'process'>;
interface MessageProcessDurationAttributes extends StandardAttributes<'process'>, TopicAttributes {
  [MESSAGING_SYSTEM]: string;
  [MESSAGING_OPERATION_NAME]: 'process';
  [ERROR_TYPE]?: string;
}
type RecordPendingMetric = (errorType?: string | undefined) => void;

function prepareCounter<T extends Attributes>(meter: Counter<T>, value: number, attributes: T): RecordPendingMetric {
  return (errorType?: string | undefined) => {
    meter.add(value, {
      ...attributes,
      ...(errorType ? { [ERROR_TYPE]: errorType } : {}),
    });
  };
}

function prepareDurationHistogram<T extends Attributes>(
  meter: Histogram<T>,
  value: number,
  attributes: T,
): RecordPendingMetric {
  return (errorType?: string | undefined) => {
    meter.record((Date.now() - value) / 1000, {
      ...attributes,
      ...(errorType ? { [ERROR_TYPE]: errorType } : {}),
    });
  };
}

const HISTOGRAM_BUCKET_BOUNDARIES = [0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 0.75, 1, 2.5, 5, 7.5, 10];
export class KafkaJsInstrumentation extends InstrumentationBase<KafkaJsInstrumentationConfig> {
  declare private _clientDuration: Histogram<ClientDurationAttributes>;
  declare private _sentMessages: Counter<SentMessagesAttributes>;
  declare private _consumedMessages: Counter<ConsumedMessagesAttributes>;
  declare private _processDuration: Histogram<MessageProcessDurationAttributes>;

  constructor(config: KafkaJsInstrumentationConfig = {}) {
    super(PACKAGE_NAME, SDK_VERSION, config);
  }

  override _updateMetricInstruments() {
    this._clientDuration = this.meter.createHistogram(METRIC_MESSAGING_CLIENT_OPERATION_DURATION, {
      advice: { explicitBucketBoundaries: HISTOGRAM_BUCKET_BOUNDARIES },
    });
    this._sentMessages = this.meter.createCounter(METRIC_MESSAGING_CLIENT_SENT_MESSAGES);
    this._consumedMessages = this.meter.createCounter(METRIC_MESSAGING_CLIENT_CONSUMED_MESSAGES);
    this._processDuration = this.meter.createHistogram(METRIC_MESSAGING_PROCESS_DURATION, {
      advice: { explicitBucketBoundaries: HISTOGRAM_BUCKET_BOUNDARIES },
    });
  }

  protected init() {
    const unpatch = (moduleExports: any) => {
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

        if (isWrapped(newConsumer.run)) {
          instrumentation._unwrap(newConsumer, 'run');
        }

        instrumentation._wrap(newConsumer, 'run', instrumentation._getConsumerRunPatch());

        instrumentation._setKafkaEventListeners(newConsumer);

        return newConsumer;
      };
    };
  }

  private _setKafkaEventListeners(kafkaObj: KafkaEventEmitter) {
    if (kafkaObj[EVENT_LISTENERS_SET]) return;

    // The REQUEST Consumer event was added in kafkajs@1.5.0.
    if (kafkaObj.events?.REQUEST) {
      kafkaObj.on(kafkaObj.events.REQUEST, this._recordClientDurationMetric.bind(this));
    }

    kafkaObj[EVENT_LISTENERS_SET] = true;
  }

  private _recordClientDurationMetric(event: Pick<RequestEvent, 'payload'>) {
    const [address = '', port = '0'] = event.payload.broker.split(':');
    this._clientDuration.record(event.payload.duration / 1000, {
      [MESSAGING_SYSTEM]: MESSAGING_SYSTEM_VALUE_KAFKA,
      [MESSAGING_OPERATION_NAME]: `${event.payload.apiName}`,
      [SERVER_ADDRESS]: address,
      [SERVER_PORT]: Number.parseInt(port, 10),
    });
  }

  private _getProducerPatch() {
    const instrumentation = this;
    return (original: Kafka['producer']) => {
      return function consumer(this: Kafka, ...args: Parameters<Kafka['producer']>) {
        const newProducer: Producer = original.apply(this, args);

        if (isWrapped(newProducer.sendBatch)) {
          instrumentation._unwrap(newProducer, 'sendBatch');
        }
        instrumentation._wrap(newProducer, 'sendBatch', instrumentation._getSendBatchPatch());

        if (isWrapped(newProducer.send)) {
          instrumentation._unwrap(newProducer, 'send');
        }
        instrumentation._wrap(newProducer, 'send', instrumentation._getSendPatch());

        if (isWrapped(newProducer.transaction)) {
          instrumentation._unwrap(newProducer, 'transaction');
        }
        instrumentation._wrap(newProducer, 'transaction', instrumentation._getProducerTransactionPatch());

        instrumentation._setKafkaEventListeners(newProducer);

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
    const instrumentation = this;
    return (original: ConsumerRunConfig['eachMessage']) => {
      return function eachMessage(this: unknown, ...args: Parameters<EachMessageHandler>): Promise<void> {
        const payload = args[0];
        const propagatedContext: Context = propagation.extract(
          ROOT_CONTEXT,
          payload.message.headers,
          bufferTextMapGetter,
        );
        const span = instrumentation._startConsumerSpan({
          topic: payload.topic,
          message: payload.message,
          operationType: MESSAGING_OPERATION_TYPE_VALUE_PROCESS,
          ctx: propagatedContext,
          attributes: {
            [ATTR_MESSAGING_DESTINATION_PARTITION_ID]: String(payload.partition),
          },
        });

        const pendingMetrics: RecordPendingMetric[] = [
          prepareDurationHistogram(instrumentation._processDuration, Date.now(), {
            [MESSAGING_SYSTEM]: MESSAGING_SYSTEM_VALUE_KAFKA,
            [MESSAGING_OPERATION_NAME]: 'process',
            [MESSAGING_DESTINATION_NAME]: payload.topic,
            [ATTR_MESSAGING_DESTINATION_PARTITION_ID]: String(payload.partition),
          }),
          prepareCounter(instrumentation._consumedMessages, 1, {
            [MESSAGING_SYSTEM]: MESSAGING_SYSTEM_VALUE_KAFKA,
            [MESSAGING_OPERATION_NAME]: 'process',
            [MESSAGING_DESTINATION_NAME]: payload.topic,
            [ATTR_MESSAGING_DESTINATION_PARTITION_ID]: String(payload.partition),
          }),
        ];

        const eachMessagePromise = context.with(trace.setSpan(propagatedContext, span), () => {
          return original!.apply(this, args);
        });
        return instrumentation._endSpansOnPromise([span], pendingMetrics, eachMessagePromise);
      };
    };
  }

  private _getConsumerEachBatchPatch() {
    return (original: ConsumerRunConfig['eachBatch']) => {
      const instrumentation = this;
      return function eachBatch(this: unknown, ...args: Parameters<EachBatchHandler>): Promise<void> {
        const payload = args[0];
        // https://github.com/open-telemetry/opentelemetry-specification/blob/master/specification/trace/semantic_conventions/messaging.md#topic-with-multiple-consumers
        const receivingSpan = instrumentation._startConsumerSpan({
          topic: payload.batch.topic,
          message: undefined,
          operationType: MESSAGING_OPERATION_TYPE_VALUE_RECEIVE,
          ctx: ROOT_CONTEXT,
          attributes: {
            [MESSAGING_BATCH_MESSAGE_COUNT]: payload.batch.messages.length,
            [ATTR_MESSAGING_DESTINATION_PARTITION_ID]: String(payload.batch.partition),
          },
        });
        return context.with(trace.setSpan(context.active(), receivingSpan), () => {
          const startTime = Date.now();
          const spans: Span[] = [];
          const pendingMetrics: RecordPendingMetric[] = [
            prepareCounter(instrumentation._consumedMessages, payload.batch.messages.length, {
              [MESSAGING_SYSTEM]: MESSAGING_SYSTEM_VALUE_KAFKA,
              [MESSAGING_OPERATION_NAME]: 'process',
              [MESSAGING_DESTINATION_NAME]: payload.batch.topic,
              [ATTR_MESSAGING_DESTINATION_PARTITION_ID]: String(payload.batch.partition),
            }),
          ];
          payload.batch.messages.forEach((message: any) => {
            const propagatedContext: Context = propagation.extract(ROOT_CONTEXT, message.headers, bufferTextMapGetter);
            const spanContext = trace.getSpan(propagatedContext)?.spanContext();
            let origSpanLink: Link | undefined;
            if (spanContext) {
              origSpanLink = {
                context: spanContext,
              };
            }
            spans.push(
              instrumentation._startConsumerSpan({
                topic: payload.batch.topic,
                message,
                operationType: MESSAGING_OPERATION_TYPE_VALUE_PROCESS,
                link: origSpanLink,
                attributes: {
                  [ATTR_MESSAGING_DESTINATION_PARTITION_ID]: String(payload.batch.partition),
                },
              }),
            );
            pendingMetrics.push(
              prepareDurationHistogram(instrumentation._processDuration, startTime, {
                [MESSAGING_SYSTEM]: MESSAGING_SYSTEM_VALUE_KAFKA,
                [MESSAGING_OPERATION_NAME]: 'process',
                [MESSAGING_DESTINATION_NAME]: payload.batch.topic,
                [ATTR_MESSAGING_DESTINATION_PARTITION_ID]: String(payload.batch.partition),
              }),
            );
          });
          const batchMessagePromise: Promise<void> = original!.apply(this, args);
          spans.unshift(receivingSpan);
          return instrumentation._endSpansOnPromise(spans, pendingMetrics, batchMessagePromise);
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
        const transactionSpan = instrumentation.tracer.startSpan('transaction');

        const transactionPromise = original.apply(this, args);

        transactionPromise
          .then((transaction: Transaction) => {
            const originalSend = transaction.send;
            transaction.send = function send(this: Transaction, ...args) {
              return context.with(trace.setSpan(context.active(), transactionSpan), () => {
                const patched = instrumentation._getSendPatch()(originalSend);
                return patched.apply(this, args).catch((err: any) => {
                  transactionSpan.setStatus({
                    code: SpanStatusCode.ERROR,
                    message: err?.message,
                  });
                  transactionSpan.recordException(err);
                  throw err;
                });
              });
            };

            const originalSendBatch = transaction.sendBatch;
            transaction.sendBatch = function sendBatch(this: Transaction, ...args) {
              return context.with(trace.setSpan(context.active(), transactionSpan), () => {
                const patched = instrumentation._getSendBatchPatch()(originalSendBatch);
                return patched.apply(this, args).catch((err: any) => {
                  transactionSpan.setStatus({
                    code: SpanStatusCode.ERROR,
                    message: err?.message,
                  });
                  transactionSpan.recordException(err);
                  throw err;
                });
              });
            };

            const originalCommit = transaction.commit;
            transaction.commit = function commit(this: Transaction, ...args) {
              const originCommitPromise = originalCommit.apply(this, args).then(() => {
                transactionSpan.setStatus({ code: SpanStatusCode.OK });
              });
              return instrumentation._endSpansOnPromise([transactionSpan], [], originCommitPromise);
            };

            const originalAbort = transaction.abort;
            transaction.abort = function abort(this: Transaction, ...args) {
              const originAbortPromise = originalAbort.apply(this, args);
              return instrumentation._endSpansOnPromise([transactionSpan], [], originAbortPromise);
            };
          })
          .catch((err: any) => {
            transactionSpan.setStatus({
              code: SpanStatusCode.ERROR,
              message: err?.message,
            });
            transactionSpan.recordException(err);
            transactionSpan.end();
          });

        return transactionPromise;
      };
    };
  }

  private _getSendBatchPatch() {
    const instrumentation = this;
    return (original: Producer['sendBatch'] | Transaction['sendBatch']) => {
      return function sendBatch(
        this: Producer | Transaction,
        ...args: Parameters<Producer['sendBatch']>
      ): ReturnType<Producer['sendBatch']> {
        const batch = args[0];
        const messages = batch.topicMessages || [];

        const spans: Span[] = [];
        const pendingMetrics: RecordPendingMetric[] = [];

        messages.forEach((topicMessage: any) => {
          topicMessage.messages.forEach((message: any) => {
            spans.push(instrumentation._startProducerSpan(topicMessage.topic, message));
            pendingMetrics.push(
              prepareCounter(instrumentation._sentMessages, 1, {
                [MESSAGING_SYSTEM]: MESSAGING_SYSTEM_VALUE_KAFKA,
                [MESSAGING_OPERATION_NAME]: 'send',
                [MESSAGING_DESTINATION_NAME]: topicMessage.topic,
                ...(message.partition !== undefined
                  ? {
                      [ATTR_MESSAGING_DESTINATION_PARTITION_ID]: String(message.partition),
                    }
                  : {}),
              }),
            );
          });
        });
        const origSendResult: Promise<RecordMetadata[]> = original.apply(this, args);
        return instrumentation._endSpansOnPromise(spans, pendingMetrics, origSendResult);
      };
    };
  }

  private _getSendPatch() {
    const instrumentation = this;
    return (original: Producer['send'] | Transaction['send']) => {
      return function send(
        this: Producer | Transaction,
        ...args: Parameters<Producer['send']>
      ): ReturnType<Producer['send']> {
        const record = args[0];
        const spans: Span[] = record.messages.map((message: any) => {
          return instrumentation._startProducerSpan(record.topic, message);
        });

        const pendingMetrics: RecordPendingMetric[] = record.messages.map((m: any) =>
          prepareCounter(instrumentation._sentMessages, 1, {
            [MESSAGING_SYSTEM]: MESSAGING_SYSTEM_VALUE_KAFKA,
            [MESSAGING_OPERATION_NAME]: 'send',
            [MESSAGING_DESTINATION_NAME]: record.topic,
            ...(m.partition !== undefined
              ? {
                  [ATTR_MESSAGING_DESTINATION_PARTITION_ID]: String(m.partition),
                }
              : {}),
          }),
        );
        const origSendResult: Promise<RecordMetadata[]> = original.apply(this, args);
        return instrumentation._endSpansOnPromise(spans, pendingMetrics, origSendResult);
      };
    };
  }

  private _endSpansOnPromise<T>(
    spans: Span[],
    pendingMetrics: RecordPendingMetric[],
    sendPromise: Promise<T>,
  ): Promise<T> {
    return Promise.resolve(sendPromise)
      .then(result => {
        pendingMetrics.forEach(m => m());
        return result;
      })
      .catch(reason => {
        let errorMessage: string | undefined;
        let errorType: string = ERROR_TYPE_VALUE_OTHER;
        if (typeof reason === 'string' || reason === undefined) {
          errorMessage = reason;
        } else if (typeof reason === 'object' && Object.prototype.hasOwnProperty.call(reason, 'message')) {
          errorMessage = reason.message;
          errorType = reason.constructor.name;
        }
        pendingMetrics.forEach(m => m(errorType));

        spans.forEach(span => {
          span.setAttribute(ERROR_TYPE, errorType);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: errorMessage,
          });
        });

        throw reason;
      })
      .finally(() => {
        spans.forEach(span => span.end());
      });
  }

  private _startConsumerSpan({ topic, message, operationType, ctx, link, attributes }: ConsumerSpanOptions) {
    const operationName =
      operationType === MESSAGING_OPERATION_TYPE_VALUE_RECEIVE
        ? 'poll' // for batch processing spans
        : operationType; // for individual message processing spans

    const span = this.tracer.startSpan(
      `${operationName} ${topic}`,
      {
        kind: operationType === MESSAGING_OPERATION_TYPE_VALUE_RECEIVE ? SpanKind.CLIENT : SpanKind.CONSUMER,
        attributes: {
          ...attributes,
          [MESSAGING_SYSTEM]: MESSAGING_SYSTEM_VALUE_KAFKA,
          [MESSAGING_DESTINATION_NAME]: topic,
          [MESSAGING_OPERATION_TYPE]: operationType,
          [MESSAGING_OPERATION_NAME]: operationName,
          [ATTR_MESSAGING_KAFKA_MESSAGE_KEY]: message?.key ? String(message.key) : undefined,
          [ATTR_MESSAGING_KAFKA_MESSAGE_TOMBSTONE]: message?.key && message.value === null ? true : undefined,
          [ATTR_MESSAGING_KAFKA_OFFSET]: message?.offset,
        },
        links: link ? [link] : [],
      },
      ctx,
    );

    const { consumerHook } = this.getConfig();
    if (consumerHook && message) {
      safeExecuteInTheMiddle(
        () => consumerHook(span, { topic, message }),
        e => {
          if (e) this._diag.error('consumerHook error', e);
        },
        true,
      );
    }

    return span;
  }

  private _startProducerSpan(topic: string, message: Message) {
    const span = this.tracer.startSpan(`send ${topic}`, {
      kind: SpanKind.PRODUCER,
      attributes: {
        [MESSAGING_SYSTEM]: MESSAGING_SYSTEM_VALUE_KAFKA,
        [MESSAGING_DESTINATION_NAME]: topic,
        [ATTR_MESSAGING_KAFKA_MESSAGE_KEY]: message.key ? String(message.key) : undefined,
        [ATTR_MESSAGING_KAFKA_MESSAGE_TOMBSTONE]: message.key && message.value === null ? true : undefined,
        [ATTR_MESSAGING_DESTINATION_PARTITION_ID]:
          message.partition !== undefined ? String(message.partition) : undefined,
        [MESSAGING_OPERATION_NAME]: 'send',
        [MESSAGING_OPERATION_TYPE]: MESSAGING_OPERATION_TYPE_VALUE_SEND,
      },
    });

    message.headers = message.headers ?? {};
    propagation.inject(trace.setSpan(context.active(), span), message.headers);

    const { producerHook } = this.getConfig();
    if (producerHook) {
      safeExecuteInTheMiddle(
        () => producerHook(span, { topic, message }),
        e => {
          if (e) this._diag.error('producerHook error', e);
        },
        true,
      );
    }

    return span;
  }
}
