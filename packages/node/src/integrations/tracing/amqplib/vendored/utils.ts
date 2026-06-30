/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-amqplib
 * - Upstream version: @opentelemetry/instrumentation-amqplib@0.65.0
 * - Some types vendored from @types/amqplib with simplifications
 * - Span creation extracted here and migrated to the @sentry/core API; origin folded into span creation
 * - Cross-service trace propagation uses Sentry's `getTraceData` instead of the OTel propagator
 * - Dropped the env-gated stable-semconv dual emission; only the (default) old semantic conventions are emitted
 * - Replaced the OTel context-key confirm-channel marker with a synchronous flag on the channel instance
 */

import { SpanKind } from '@opentelemetry/api';
import type { Span, SpanAttributes } from '@sentry/core';
import { getTraceData, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, startInactiveSpan } from '@sentry/core';
import type { Channel, ConfirmChannel, Connection, Options } from './amqplib-types';
import {
  ATTR_MESSAGING_CONVERSATION_ID,
  ATTR_MESSAGING_DESTINATION,
  ATTR_MESSAGING_DESTINATION_KIND,
  ATTR_MESSAGING_OPERATION,
  ATTR_MESSAGING_PROTOCOL,
  ATTR_MESSAGING_PROTOCOL_VERSION,
  ATTR_MESSAGING_RABBITMQ_ROUTING_KEY,
  ATTR_MESSAGING_SYSTEM,
  ATTR_MESSAGING_URL,
  ATTR_NET_PEER_NAME,
  ATTR_NET_PEER_PORT,
  MESSAGING_DESTINATION_KIND_VALUE_TOPIC,
  MESSAGING_OPERATION_VALUE_PROCESS,
  OLD_ATTR_MESSAGING_MESSAGE_ID,
} from './semconv';
import type { ConsumeMessage, Message } from './types';

const PUBLISHER_ORIGIN = 'auto.amqplib.otel.publisher';
const CONSUMER_ORIGIN = 'auto.amqplib.otel.consumer';

export const MESSAGE_STORED_SPAN: unique symbol = Symbol('opentelemetry.amqplib.message.stored-span');
export const CHANNEL_SPANS_NOT_ENDED: unique symbol = Symbol('opentelemetry.amqplib.channel.spans-not-ended');
export const CHANNEL_CONSUME_TIMEOUT_TIMER: unique symbol = Symbol(
  'opentelemetry.amqplib.channel.consumer-timeout-timer',
);
export const CONNECTION_ATTRIBUTES: unique symbol = Symbol('opentelemetry.amqplib.connection.attributes');
export const CHANNEL_IS_CONFIRM_PUBLISHING: unique symbol = Symbol('sentry.amqplib.channel.is-confirm-publishing');

export type InstrumentationConnection = Connection & {
  [CONNECTION_ATTRIBUTES]?: SpanAttributes;
};
export type InstrumentationPublishChannel = (Channel | ConfirmChannel) & {
  connection: InstrumentationConnection;
  [CHANNEL_IS_CONFIRM_PUBLISHING]?: boolean;
};
export type InstrumentationConsumeChannel = Channel & {
  connection: InstrumentationConnection;
  [CHANNEL_SPANS_NOT_ENDED]?: {
    msg: ConsumeMessage;
    timeOfConsume: number;
  }[];
  [CHANNEL_CONSUME_TIMEOUT_TIMER]?: NodeJS.Timeout;
};
export type InstrumentationMessage = Message & {
  [MESSAGE_STORED_SPAN]?: Span;
};
export type InstrumentationConsumeMessage = ConsumeMessage & {
  [MESSAGE_STORED_SPAN]?: Span;
};

export const normalizeExchange = (exchangeName: string): string => (exchangeName !== '' ? exchangeName : '<default>');

const censorPassword = (url: string): string => {
  return url.replace(/:[^:@/]*@/, ':***@');
};

const getPort = (portFromUrl: number | undefined, resolvedProtocol: string): number => {
  // we are using the resolved protocol which is upper case
  // this code mimics the behavior of amqplib which is used to set connection params
  return portFromUrl || (resolvedProtocol === 'AMQP' ? 5672 : 5671);
};

const getProtocol = (protocolFromUrl: string | undefined): string => {
  const resolvedProtocol = protocolFromUrl || 'amqp';
  // the substring removes the ':' part of the protocol ('amqp:' -> 'amqp')
  const noEndingColon = resolvedProtocol.endsWith(':')
    ? resolvedProtocol.substring(0, resolvedProtocol.length - 1)
    : resolvedProtocol;
  // upper case to match spec
  return noEndingColon.toUpperCase();
};

const getHostname = (hostnameFromUrl: string | undefined): string => {
  // if user supplies empty hostname, it gets forwarded to 'net' package which defaults it to localhost.
  // https://nodejs.org/docs/latest-v12.x/api/net.html#net_socket_connect_options_connectlistener
  return hostnameFromUrl || 'localhost';
};

export const getConnectionAttributesFromServer = (conn: Connection): SpanAttributes => {
  const product = conn.serverProperties.product?.toLowerCase?.();
  if (product) {
    return {
      [ATTR_MESSAGING_SYSTEM]: product,
    };
  } else {
    return {};
  }
};

export const getConnectionAttributesFromUrl = (url: string | Options.Connect): SpanAttributes => {
  const attributes: SpanAttributes = {
    [ATTR_MESSAGING_PROTOCOL_VERSION]: '0.9.1', // this is the only protocol supported by the instrumented library
  };

  const resolvedUrl = url || 'amqp://localhost';
  if (typeof resolvedUrl === 'object') {
    const connectOptions = resolvedUrl;

    const protocol = getProtocol(connectOptions?.protocol);
    attributes[ATTR_MESSAGING_PROTOCOL] = protocol;
    attributes[ATTR_NET_PEER_NAME] = getHostname(connectOptions?.hostname);
    attributes[ATTR_NET_PEER_PORT] = getPort(connectOptions.port, protocol);
  } else {
    const censoredUrl = censorPassword(resolvedUrl);
    attributes[ATTR_MESSAGING_URL] = censoredUrl;
    try {
      const urlParts = new URL(censoredUrl);

      const protocol = getProtocol(urlParts.protocol);
      attributes[ATTR_MESSAGING_PROTOCOL] = protocol;
      attributes[ATTR_NET_PEER_NAME] = getHostname(urlParts.hostname);
      attributes[ATTR_NET_PEER_PORT] = getPort(urlParts.port ? parseInt(urlParts.port) : undefined, protocol);
    } catch {
      // best-effort: a malformed url simply yields fewer connection attributes
    }
  }
  return attributes;
};

/** Reads a propagation header value off an amqplib message as a string. */
export function getHeaderAsString(headers: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = headers?.[key];
  if (value == null) {
    return undefined;
  }
  return Array.isArray(value) ? String(value[0]) : String(value);
}

/** Starts an inactive producer span and propagates its trace into the publish `options.headers`. */
export function startPublishSpan(
  exchange: string,
  routingKey: string,
  channel: InstrumentationPublishChannel,
  options?: Options.Publish,
): { span: Span; modifiedOptions: Options.Publish } {
  const normalizedExchange = normalizeExchange(exchange);

  const span = startInactiveSpan({
    name: `publish ${normalizedExchange}`,
    kind: SpanKind.PRODUCER,
    attributes: {
      ...channel.connection[CONNECTION_ATTRIBUTES],
      [ATTR_MESSAGING_DESTINATION]: exchange,
      [ATTR_MESSAGING_DESTINATION_KIND]: MESSAGING_DESTINATION_KIND_VALUE_TOPIC,
      [ATTR_MESSAGING_RABBITMQ_ROUTING_KEY]: routingKey,
      [OLD_ATTR_MESSAGING_MESSAGE_ID]: options?.messageId,
      [ATTR_MESSAGING_CONVERSATION_ID]: options?.correlationId,
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: PUBLISHER_ORIGIN,
    },
  });

  const modifiedOptions = options ?? {};
  modifiedOptions.headers = modifiedOptions.headers ?? {};

  const traceData = getTraceData({ span });
  if (traceData['sentry-trace']) {
    modifiedOptions.headers['sentry-trace'] = traceData['sentry-trace'];
  }
  if (traceData.baggage) {
    modifiedOptions.headers['baggage'] = traceData.baggage;
  }

  return { span, modifiedOptions };
}

/** Starts an inactive consumer (process) span carrying the amqplib messaging attributes. */
export function startConsumeSpan(
  queue: string,
  msg: InstrumentationConsumeMessage,
  channel: InstrumentationConsumeChannel,
): Span {
  return startInactiveSpan({
    name: `${queue} process`,
    kind: SpanKind.CONSUMER,
    attributes: {
      ...channel?.connection?.[CONNECTION_ATTRIBUTES],
      [ATTR_MESSAGING_DESTINATION]: msg.fields?.exchange,
      [ATTR_MESSAGING_DESTINATION_KIND]: MESSAGING_DESTINATION_KIND_VALUE_TOPIC,
      [ATTR_MESSAGING_RABBITMQ_ROUTING_KEY]: msg.fields?.routingKey,
      [ATTR_MESSAGING_OPERATION]: MESSAGING_OPERATION_VALUE_PROCESS,
      [OLD_ATTR_MESSAGING_MESSAGE_ID]: msg?.properties.messageId,
      [ATTR_MESSAGING_CONVERSATION_ID]: msg?.properties.correlationId,
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: CONSUMER_ORIGIN,
    },
  });
}
