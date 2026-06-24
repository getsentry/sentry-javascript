/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-amqplib
 * - Upstream version: @opentelemetry/instrumentation-amqplib@0.65.0
 * - Some types vendored from @types/amqplib with simplifications
 * - Dropped the instrumentation config and all hooks; the SDK folds origin into span creation instead
 */

export enum EndOperation {
  AutoAck = 'auto ack',
  Ack = 'ack',
  AckAll = 'ackAll',
  Reject = 'reject',
  Nack = 'nack',
  NackAll = 'nackAll',
  ChannelClosed = 'channel closed',
  ChannelError = 'channel error',
  InstrumentationTimeout = 'instrumentation timeout',
}

// The following types are vendored from `@types/amqplib@0.10.1` - commit SHA: 4205e03127692a40b4871709a7134fe4e2ed5510

// Vendored from: https://github.com/DefinitelyTyped/DefinitelyTyped/blob/4205e03127692a40b4871709a7134fe4e2ed5510/types/amqplib/properties.d.ts#L142
export interface Message {
  content: Buffer;
  fields: MessageFields;
  properties: MessageProperties;
}

export interface ConsumeMessage extends Message {
  fields: ConsumeMessageFields;
}

export interface CommonMessageFields {
  deliveryTag: number;
  redelivered: boolean;
  exchange: string;
  routingKey: string;
}

export interface MessageFields extends CommonMessageFields {
  messageCount?: number;
  consumerTag?: string;
}

export interface ConsumeMessageFields extends CommonMessageFields {
  deliveryTag: number;
}

export interface MessageProperties {
  contentType: any | undefined;
  contentEncoding: any | undefined;
  headers: any;
  deliveryMode: any | undefined;
  priority: any | undefined;
  correlationId: any | undefined;
  replyTo: any | undefined;
  expiration: any | undefined;
  messageId: any | undefined;
  timestamp: any | undefined;
  type: any | undefined;
  userId: any | undefined;
  appId: any | undefined;
  clusterId: any | undefined;
}
