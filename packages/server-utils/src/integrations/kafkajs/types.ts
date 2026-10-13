/*
 * Structural types for the kafkajs shapes this subscriber reads. Kept minimal and local so
 * `@sentry/server-utils` never takes a runtime dependency on `kafkajs`. Simplified from the vendored
 * OTel instrumentation (`@sentry/node`'s `integrations/tracing/kafka/vendored/kafkajs-types.ts`).
 */

export interface Message {
  key?: Buffer | string | null;
  value: Buffer | string | null;
  partition?: number;
  headers?: Record<string, Buffer | string | (Buffer | string)[] | undefined>;
  timestamp?: string;
}

export type KafkaMessage = { [key: string]: unknown } & Message;

/** A single `{ topic, messages }` entry of a `sendBatch({ topicMessages })` call. */
export interface TopicMessages {
  topic: string;
  messages: Message[];
}

/** The `sendBatch`/`send` argument shape after kafkajs normalizes `send` into `sendBatch`. */
export interface ProducerBatch {
  topicMessages?: TopicMessages[];
}

export interface EachMessagePayload {
  topic: string;
  partition: number;
  message: KafkaMessage;
}

export interface Batch {
  topic: string;
  partition: number;
  messages: KafkaMessage[];
}

export interface EachBatchPayload {
  batch: Batch;
}

export type EachMessageHandler = (payload: EachMessagePayload) => Promise<void>;
export type EachBatchHandler = (payload: EachBatchPayload) => Promise<void>;

/** The `consumer.run(config)` argument shape; only the two callbacks are read/swapped. */
export interface ConsumerRunConfig {
  eachMessage?: EachMessageHandler | null;
  eachBatch?: EachBatchHandler | null;
}
