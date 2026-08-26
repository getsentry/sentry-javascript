/* eslint-disable max-lines */
import * as diagnosticsChannel from 'node:diagnostics_channel';
import type { IntegrationFn, Span, SpanAttributes } from '@sentry/core';
import {
  continueTrace,
  defineIntegration,
  getClient,
  getTraceData,
  hasSpanStreamingEnabled,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SPAN_STATUS_ERROR,
  startInactiveSpan,
  timestampInSeconds,
} from '@sentry/core';
import {
  MESSAGING_DESTINATION_NAME,
  MESSAGING_MESSAGE_ID,
  MESSAGING_OPERATION_NAME,
  MESSAGING_OPERATION_TYPE,
  MESSAGING_SYSTEM,
  NETWORK_PROTOCOL_NAME,
  NETWORK_PROTOCOL_VERSION,
  SENTRY_KIND,
  SENTRY_OP,
  SENTRY_SEGMENT_NAME_SOURCE,
  SERVER_ADDRESS,
  SERVER_PORT,
  URL_FULL,
} from '@sentry/conventions/attributes';
import { QUEUE_PROCESS, QUEUE_PUBLISH } from '@sentry/conventions/op';
import { amqplibModuleNames } from '../orchestrion/config/amqplib';
import { invokeOrchestrionInstrumentation } from '../orchestrion/instrumentation';
import { CHANNELS } from '../orchestrion/channels';
import { bindTracingChannelToSpan } from '../tracing-channel';

// NOTE: this uses the same name as the OTel integration by design.
// When enabled, the OTel 'Amqplib' integration is omitted from the default set.
const INTEGRATION_NAME = 'Amqplib' as const;

const PUBLISHER_ORIGIN = 'auto.amqplib.publisher';
const CONSUMER_ORIGIN = 'auto.amqplib.consumer';

const ATTR_MESSAGING_RABBITMQ_DESTINATION_ROUTING_KEY = 'messaging.rabbitmq.destination.routing_key';
const ATTR_MESSAGING_CONVERSATION_ID = 'messaging.message.conversation_id';

const MESSAGING_OPERATION_VALUE_PROCESS = 'process';
const MESSAGING_OPERATION_VALUE_SEND = 'send';

// To prevent reference leaks from un-acked messages, their spans are closed after this timeout. The
// upstream instrumentation exposed this as the `consumeTimeoutMs` option; the SDK always used the default.
const CONSUME_TIMEOUT_MS = 1000 * 60; // 1 minute

// The end-operation labels used in the consumer span's error status message.
const END_OP = {
  Ack: 'ack',
  AckAll: 'ackAll',
  Reject: 'reject',
  Nack: 'nack',
  NackAll: 'nackAll',
  ChannelClosed: 'channel closed',
  ChannelError: 'channel error',
  InstrumentationTimeout: 'instrumentation timeout',
} as const;
type EndOp = (typeof END_OP)[keyof typeof END_OP];

// State stashed on the live amqplib objects (mirrors the vendored OTel instrumentation's symbols).
const MESSAGE_STORED_SPAN: unique symbol = Symbol('sentry.amqplib.message.stored-span');
const CHANNEL_SPANS_NOT_ENDED: unique symbol = Symbol('sentry.amqplib.channel.spans-not-ended');
const CHANNEL_CONSUME_TIMEOUT_TIMER: unique symbol = Symbol('sentry.amqplib.channel.consume-timeout-timer');
const CHANNEL_CONSUMER_INFO: unique symbol = Symbol('sentry.amqplib.channel.consumer-info');
const CHANNEL_IS_CONFIRM_PUBLISHING: unique symbol = Symbol('sentry.amqplib.channel.is-confirm-publishing');
const CONNECTION_ATTRIBUTES: unique symbol = Symbol('sentry.amqplib.connection.attributes');

interface MessageFields {
  deliveryTag?: number;
  exchange?: string;
  routingKey?: string;
  consumerTag?: string;
}

interface MessageProperties {
  headers?: Record<string, unknown>;
  messageId?: unknown;
  correlationId?: unknown;
}

interface ConsumeMessage {
  fields?: MessageFields;
  properties?: MessageProperties;
  [MESSAGE_STORED_SPAN]?: Span;
}

interface PublishOptions {
  headers?: Record<string, unknown>;
  messageId?: unknown;
  correlationId?: unknown;
}

interface ConnectionLike {
  serverProperties?: { product?: string };
  // Some amqplib versions nest the low-level connection one level deeper.
  connection?: { serverProperties?: { product?: string } };
  [CONNECTION_ATTRIBUTES]?: SpanAttributes;
}

interface ConsumerInfo {
  noAck: boolean;
  queue: string;
}

interface ChannelLike {
  connection?: ConnectionLike;
  on?: (event: string, listener: (...args: unknown[]) => void) => unknown;
  [CHANNEL_SPANS_NOT_ENDED]?: { msg: ConsumeMessage; timeOfConsume: number }[];
  [CHANNEL_CONSUME_TIMEOUT_TIMER]?: ReturnType<typeof setInterval>;
  [CHANNEL_CONSUMER_INFO]?: Map<string, ConsumerInfo>;
  [CHANNEL_IS_CONFIRM_PUBLISHING]?: boolean;
}

/**
 * The shape orchestrion's transform attaches to the tracing-channel `context`. Documented here rather
 * than imported because orchestrion's runtime doesn't export it.
 */
interface AmqpChannelContext {
  // The live args array passed to the wrapped call.
  arguments: unknown[];
  self?: ChannelLike;
  result?: unknown;
  error?: unknown;
}

interface AmqpDispatchContext extends AmqpChannelContext {
  // Whether the delivering consumer registered with `noAck`; set at span creation so `deferSpanEnd`
  // knows whether the helper should end the span (noAck) or leave it open until ack/nack (manual ack).
  _sentryNoAck?: boolean;
}

interface AmqpConnectContext {
  arguments?: unknown[];
  result?: unknown;
}

const NOOP = (): void => {};

const _amqplibIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      invokeOrchestrionInstrumentation(client, amqplibModuleNames, instrumentAmqplib, []);
    },
  };
}) satisfies IntegrationFn;

function instrumentAmqplib(): void {
  subscribeConnect();
  subscribePublish();
  subscribeConfirmPublish();
  subscribeConsume();
  subscribeDispatch();
  subscribeSettle();
}

/**
 * Producer span for `Channel.prototype.publish`. Creates a PRODUCER span, injects the trace headers
 * into the publish options, and ends when the (synchronous) publish call returns. Skips the confirm
 * channel's internal `super.publish` call, which is already handled by {@link subscribeConfirmPublish}.
 */
function subscribePublish(): void {
  bindTracingChannelToSpan(diagnosticsChannel.tracingChannel<AmqpChannelContext>(CHANNELS.AMQPLIB_PUBLISH), data => {
    if (data.self?.[CHANNEL_IS_CONFIRM_PUBLISHING]) {
      return undefined;
    }
    return startPublishSpan(data);
  });
}

/**
 * Producer span for `ConfirmChannel.prototype.publish`. The span ends on the broker-confirm callback
 * (the channel's trailing `cb` arg, wrapped by orchestrion) rather than synchronously. A synchronous
 * flag on the channel suppresses the base `publish` channel that `super.publish` triggers.
 */
function subscribeConfirmPublish(): void {
  const channel = diagnosticsChannel.tracingChannel<AmqpChannelContext>(CHANNELS.AMQPLIB_CONFIRM_PUBLISH);

  bindTracingChannelToSpan(channel, data => {
    if (data.self) {
      data.self[CHANNEL_IS_CONFIRM_PUBLISHING] = true;
    }
    return startPublishSpan(data);
  });

  // `super.publish` runs synchronously inside the confirm publish body, so clearing the flag on the
  // synchronous `end` (which fires after the body returns) is enough to guard the base publish.
  channel.end.subscribe(message => {
    const self = (message as AmqpChannelContext).self;
    if (self) {
      self[CHANNEL_IS_CONFIRM_PUBLISHING] = false;
    }
  });
}

/**
 * Records `consumerTag -> { noAck, queue }` when a consumer is registered, so the per-message
 * dispatch hook can name the span after the queue and know when to end it.
 */
function subscribeConsume(): void {
  const channel = diagnosticsChannel.tracingChannel<AmqpChannelContext>(CHANNELS.AMQPLIB_CONSUME);

  // A `start` subscriber is required for orchestrion to wrap `consume` at all.
  channel.start.subscribe(NOOP);
  channel.asyncEnd.subscribe(message => {
    const data = message as AmqpChannelContext;
    const consumerChannel = data.self;
    const result = data.result as { consumerTag?: string } | undefined;
    const consumerTag = result?.consumerTag;
    if (!consumerChannel || !consumerTag) {
      return;
    }

    ensureChannelState(consumerChannel);
    const queueArg = data.arguments[0];
    const queue = typeof queueArg === 'string' ? queueArg : '<unknown>';
    const options = data.arguments[2] as { noAck?: boolean } | undefined;
    consumerChannel[CHANNEL_CONSUMER_INFO]?.set(consumerTag, { noAck: !!options?.noAck, queue });
  });
}

/**
 * Per delivered message (`BaseChannel.prototype.dispatchMessage`): continues the producer's trace,
 * opens a CONSUMER span, and runs the user callback under it. Manual-ack consumers keep the span open
 * until `ack`/`nack`/`reject`/timeout/close; `noAck` consumers end it when dispatch returns.
 */
function subscribeDispatch(): void {
  bindTracingChannelToSpan(
    diagnosticsChannel.tracingChannel<AmqpDispatchContext>(CHANNELS.AMQPLIB_DISPATCH),
    data => {
      const channel = data.self;
      const fields = data.arguments[0] as MessageFields | undefined;
      const msg = data.arguments[1] as ConsumeMessage | null | undefined;
      // `message` is null for a consumer-cancel notification: not a real message, so no span.
      if (!channel || !msg) {
        return undefined;
      }

      ensureChannelState(channel);
      const info = fields?.consumerTag ? channel[CHANNEL_CONSUMER_INFO]?.get(fields.consumerTag) : undefined;
      const queue = info?.queue ?? msg.fields?.routingKey ?? '<unknown>';
      const noAck = info?.noAck ?? false;

      const headers = msg.properties?.headers;
      const sentryTrace = getHeaderAsString(headers, 'sentry-trace');
      const baggage = getHeaderAsString(headers, 'baggage');

      // Continue the producer's trace so the consumer span links back to the publishing service.
      const span = continueTrace({ sentryTrace, baggage }, () => startConsumeSpan(queue, msg, channel));

      if (!noAck) {
        // Track the message so its span can be ended when the user calls ack/nack/reject (or on
        // timeout/channel close).
        channel[CHANNEL_SPANS_NOT_ENDED]?.push({ msg, timeOfConsume: timestampInSeconds() });
        msg[MESSAGE_STORED_SPAN] = span;
      }

      data._sentryNoAck = noAck;
      return span;
    },
    {
      // Manual-ack consumers: the span outlives the dispatch call and is ended by ack/nack/reject
      // (or timeout/close), so take ownership and don't let the helper end it here. noAck consumers
      // have no settle call, so let the helper end the span when dispatch returns.
      deferSpanEnd({ data }) {
        return !data._sentryNoAck;
      },
    },
  );
}

/** Ends consumer spans when the user acks/nacks/rejects a message or the channel closes/errors. */
function subscribeSettle(): void {
  diagnosticsChannel
    .tracingChannel<AmqpChannelContext>(CHANNELS.AMQPLIB_ACK)
    .start.subscribe(message => handleAck(message as AmqpChannelContext, false, END_OP.Ack));
  diagnosticsChannel
    .tracingChannel<AmqpChannelContext>(CHANNELS.AMQPLIB_NACK)
    .start.subscribe(message => handleAck(message as AmqpChannelContext, true, END_OP.Nack));
  diagnosticsChannel
    .tracingChannel<AmqpChannelContext>(CHANNELS.AMQPLIB_REJECT)
    .start.subscribe(message => handleAck(message as AmqpChannelContext, true, END_OP.Reject));
  diagnosticsChannel.tracingChannel<AmqpChannelContext>(CHANNELS.AMQPLIB_ACK_ALL).start.subscribe(message => {
    const data = message as AmqpChannelContext;
    if (data.self) {
      endAllSpansOnChannel(data.self, false, END_OP.AckAll, undefined);
    }
  });
  diagnosticsChannel.tracingChannel<AmqpChannelContext>(CHANNELS.AMQPLIB_NACK_ALL).start.subscribe(message => {
    const data = message as AmqpChannelContext;
    if (data.self) {
      endAllSpansOnChannel(data.self, true, END_OP.NackAll, data.arguments[0] as boolean | undefined);
    }
  });
}

/** Captures connection attributes on the connection object for span-time reads via `channel.connection`. */
function subscribeConnect(): void {
  const channel = diagnosticsChannel.tracingChannel<AmqpConnectContext>(CHANNELS.AMQPLIB_CONNECT);
  // A `start` subscriber is required for orchestrion to wrap the callback-style `connect` at all.
  channel.start.subscribe(NOOP);
  channel.asyncEnd.subscribe(message => {
    const data = message as AmqpConnectContext;
    const conn = data.result as ConnectionLike | undefined;
    if (!conn || typeof conn !== 'object') {
      return;
    }
    conn[CONNECTION_ATTRIBUTES] = {
      ...getConnectionAttributesFromUrl(data.arguments?.[0]),
      ...getConnectionAttributesFromServer(conn),
    };
  });
}

function handleAck(data: AmqpChannelContext, isRejected: boolean, endOperation: EndOp): void {
  const channel = data.self;
  if (!channel) {
    return;
  }
  const message = data.arguments[0] as ConsumeMessage | undefined;
  if (!message) {
    return;
  }

  // `reject(message, requeue)` carries requeue in arg 1; `ack`/`nack` carry `allUpTo` in arg 1.
  const allUpToOrRequeue = data.arguments[1] as boolean | undefined;
  const requeue = data.arguments[2] as boolean | undefined;
  const requeueResolved = endOperation === END_OP.Reject ? allUpToOrRequeue : requeue;

  const spansNotEnded = channel[CHANNEL_SPANS_NOT_ENDED] ?? [];
  const msgIndex = spansNotEnded.findIndex(msgDetails => msgDetails.msg === message);
  if (msgIndex < 0) {
    // Not tracked (e.g. the user acked the same message twice) — end the stored span directly.
    endConsumerSpan(message, isRejected, endOperation, requeueResolved);
  } else if (endOperation !== END_OP.Reject && allUpToOrRequeue) {
    for (let i = 0; i <= msgIndex; i++) {
      endConsumerSpan(spansNotEnded[i]!.msg, isRejected, endOperation, requeueResolved);
    }
    spansNotEnded.splice(0, msgIndex + 1);
  } else {
    endConsumerSpan(message, isRejected, endOperation, requeueResolved);
    spansNotEnded.splice(msgIndex, 1);
  }
}

function ensureChannelState(channel: ChannelLike): void {
  if (Object.prototype.hasOwnProperty.call(channel, CHANNEL_SPANS_NOT_ENDED)) {
    return;
  }

  channel[CHANNEL_SPANS_NOT_ENDED] = [];
  channel[CHANNEL_CONSUMER_INFO] = new Map();

  const timer = setInterval(() => checkConsumeTimeoutOnChannel(channel), CONSUME_TIMEOUT_MS);
  timer.unref?.();
  channel[CHANNEL_CONSUME_TIMEOUT_TIMER] = timer;

  // End outstanding spans and stop the timer when the channel goes away (replaces patching `emit`).
  // amqplib emits 'close' after 'error', but we clear in both to avoid leaking the interval (which
  // pins the channel via its closure) should a version or edge case ever skip the trailing 'close'.
  if (typeof channel.on === 'function') {
    channel.on('close', () => {
      endAllSpansOnChannel(channel, true, END_OP.ChannelClosed, undefined);
      clearConsumeTimeoutTimer(channel);
    });
    channel.on('error', () => {
      endAllSpansOnChannel(channel, true, END_OP.ChannelError, undefined);
      clearConsumeTimeoutTimer(channel);
    });
  }
}

/** Stops and clears the per-channel consume-timeout interval. Idempotent. */
function clearConsumeTimeoutTimer(channel: ChannelLike): void {
  const activeTimer = channel[CHANNEL_CONSUME_TIMEOUT_TIMER];
  if (activeTimer) {
    clearInterval(activeTimer);
    channel[CHANNEL_CONSUME_TIMEOUT_TIMER] = undefined;
  }
}

function checkConsumeTimeoutOnChannel(channel: ChannelLike): void {
  const currentTime = timestampInSeconds();
  const spansNotEnded = channel[CHANNEL_SPANS_NOT_ENDED] ?? [];
  let i: number;
  for (i = 0; i < spansNotEnded.length; i++) {
    const currMessage = spansNotEnded[i]!;
    const timeFromConsumeMs = (currentTime - currMessage.timeOfConsume) * 1000;
    if (timeFromConsumeMs < CONSUME_TIMEOUT_MS) {
      break;
    }
    endConsumerSpan(currMessage.msg, null, END_OP.InstrumentationTimeout, true);
  }
  spansNotEnded.splice(0, i);
}

function endAllSpansOnChannel(
  channel: ChannelLike,
  isRejected: boolean,
  operation: EndOp,
  requeue: boolean | undefined,
): void {
  const spansNotEnded = channel[CHANNEL_SPANS_NOT_ENDED] ?? [];
  spansNotEnded.forEach(msgDetails => {
    endConsumerSpan(msgDetails.msg, isRejected, operation, requeue);
  });
  channel[CHANNEL_SPANS_NOT_ENDED] = [];
}

function endConsumerSpan(
  message: ConsumeMessage,
  isRejected: boolean | null,
  operation: EndOp,
  requeue: boolean | undefined,
): void {
  const storedSpan = message[MESSAGE_STORED_SPAN];
  if (!storedSpan) {
    return;
  }
  if (isRejected !== false) {
    storedSpan.setStatus({
      code: SPAN_STATUS_ERROR,
      message:
        operation !== END_OP.ChannelClosed && operation !== END_OP.ChannelError
          ? `${operation} called on message${
              requeue === true ? ' with requeue' : requeue === false ? ' without requeue' : ''
            }`
          : operation,
    });
  }
  storedSpan.end();
  message[MESSAGE_STORED_SPAN] = undefined;
}

/** Starts an inactive PRODUCER span and propagates its trace into the publish `options.headers`. */
function startPublishSpan(data: AmqpChannelContext): Span {
  const exchangeArg = data.arguments[0];
  const routingKeyArg = data.arguments[1];
  const exchange = typeof exchangeArg === 'string' ? exchangeArg : '';
  const routingKey = typeof routingKeyArg === 'string' ? routingKeyArg : '';
  let options = data.arguments[3] as PublishOptions | undefined;

  const client = getClient();

  // The default exchange has no name, so the streamed name is the operation on its own.
  const streamedName = exchange ? `${MESSAGING_OPERATION_VALUE_SEND} ${exchange}` : MESSAGING_OPERATION_VALUE_SEND;

  const span = startInactiveSpan({
    name: client && hasSpanStreamingEnabled(client) ? streamedName : `publish ${normalizeExchange(exchange)}`,
    attributes: {
      [SENTRY_OP]: QUEUE_PUBLISH,
      [SENTRY_KIND]: 'producer',
      ...getStoredConnectionAttributes(data.self),
      [MESSAGING_DESTINATION_NAME]: exchange,
      [ATTR_MESSAGING_RABBITMQ_DESTINATION_ROUTING_KEY]: routingKey,
      [MESSAGING_OPERATION_NAME]: MESSAGING_OPERATION_VALUE_SEND,
      [MESSAGING_OPERATION_TYPE]: MESSAGING_OPERATION_VALUE_SEND,
      [MESSAGING_MESSAGE_ID]: options?.messageId as string | undefined,
      [ATTR_MESSAGING_CONVERSATION_ID]: options?.correlationId as string | undefined,
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: PUBLISHER_ORIGIN,
    },
  });

  if (!options || typeof options !== 'object') {
    options = {};
    data.arguments[3] = options;
  }
  const headers = options.headers && typeof options.headers === 'object' ? options.headers : (options.headers = {});
  const traceData = getTraceData({ span });
  if (traceData['sentry-trace']) {
    headers['sentry-trace'] = traceData['sentry-trace'];
  }
  if (traceData.baggage) {
    headers['baggage'] = traceData.baggage;
  }

  return span;
}

/** Starts an inactive CONSUMER (process) span carrying the amqplib messaging attributes. */
function startConsumeSpan(queue: string, msg: ConsumeMessage, channel: ChannelLike): Span {
  const client = getClient();
  const exchange = msg.fields?.exchange;

  // `queue` falls back to the routing key (`order.created.12345`), so the streamed name uses the exchange.
  const streamedName = exchange
    ? `${MESSAGING_OPERATION_VALUE_PROCESS} ${exchange}`
    : MESSAGING_OPERATION_VALUE_PROCESS;

  return startInactiveSpan({
    name: client && hasSpanStreamingEnabled(client) ? streamedName : `${queue} process`,
    attributes: {
      [SENTRY_OP]: QUEUE_PROCESS,
      [SENTRY_KIND]: 'consumer',
      [SENTRY_SEGMENT_NAME_SOURCE]: 'component',
      ...getStoredConnectionAttributes(channel),
      [MESSAGING_DESTINATION_NAME]: exchange,
      [ATTR_MESSAGING_RABBITMQ_DESTINATION_ROUTING_KEY]: msg.fields?.routingKey,
      [MESSAGING_OPERATION_NAME]: MESSAGING_OPERATION_VALUE_PROCESS,
      [MESSAGING_OPERATION_TYPE]: MESSAGING_OPERATION_VALUE_PROCESS,
      [MESSAGING_MESSAGE_ID]: msg.properties?.messageId as string | undefined,
      [ATTR_MESSAGING_CONVERSATION_ID]: msg.properties?.correlationId as string | undefined,
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: CONSUMER_ORIGIN,
    },
  });
}

/**
 * Reads the connection attributes stashed by the `connect` channel, falling back to the live
 * connection's server product so `messaging.system` is populated even when the connection was
 * established before the integration ran.
 */
function getStoredConnectionAttributes(channel: ChannelLike | undefined): SpanAttributes {
  const connection = channel?.connection;
  const stored = connection?.[CONNECTION_ATTRIBUTES];
  if (stored) {
    return stored;
  }
  const product = connection?.serverProperties?.product ?? connection?.connection?.serverProperties?.product;
  if (typeof product === 'string' && product) {
    return { [MESSAGING_SYSTEM]: product.toLowerCase() };
  }
  return {};
}

function getConnectionAttributesFromServer(conn: ConnectionLike): SpanAttributes {
  const product = conn.serverProperties?.product ?? conn.connection?.serverProperties?.product;
  if (typeof product === 'string' && product) {
    return { [MESSAGING_SYSTEM]: product.toLowerCase() };
  }
  return {};
}

function getConnectionAttributesFromUrl(url: unknown): SpanAttributes {
  const attributes: SpanAttributes = {
    // The only protocol supported by the instrumented library.
    [NETWORK_PROTOCOL_VERSION]: '0.9.1',
  };

  const resolvedUrl = url || 'amqp://localhost';
  if (typeof resolvedUrl === 'object') {
    const connectOptions = resolvedUrl as { protocol?: string; hostname?: string; port?: number };
    const protocol = getProtocol(connectOptions.protocol);
    const hostname = getHostname(connectOptions.hostname);
    const port = getPort(connectOptions.port, protocol);

    attributes[NETWORK_PROTOCOL_NAME] = protocol;

    attributes[SERVER_ADDRESS] = hostname;
    attributes[SERVER_PORT] = port;
  } else if (typeof resolvedUrl === 'string') {
    const censoredUrl = censorPassword(resolvedUrl);
    // oxlint-disable-next-line sdk/no-unfiltered-url-attributes -- AMQP connection URL, not an HTTP request URL
    attributes[URL_FULL] = censoredUrl;

    try {
      const urlParts = new URL(censoredUrl);
      const protocol = getProtocol(urlParts.protocol);
      const hostname = getHostname(urlParts.hostname);
      const port = getPort(urlParts.port ? parseInt(urlParts.port, 10) : undefined, protocol);

      attributes[NETWORK_PROTOCOL_NAME] = protocol;

      attributes[SERVER_ADDRESS] = hostname;
      attributes[SERVER_PORT] = port;
    } catch {
      // best-effort: a malformed url simply yields fewer connection attributes
    }
  }
  return attributes;
}

function normalizeExchange(exchangeName: string): string {
  return exchangeName !== '' ? exchangeName : '<default>';
}

function censorPassword(url: string): string {
  return url.replace(/:[^:@/]*@/, ':***@');
}

function getPort(portFromUrl: number | undefined, resolvedProtocol: string): number {
  // Mimics amqplib's own defaulting; the resolved protocol is upper-cased.
  return portFromUrl || (resolvedProtocol === 'AMQP' ? 5672 : 5671);
}

function getProtocol(protocolFromUrl: string | undefined): string {
  const resolvedProtocol = protocolFromUrl || 'amqp';
  const noEndingColon = resolvedProtocol.endsWith(':')
    ? resolvedProtocol.substring(0, resolvedProtocol.length - 1)
    : resolvedProtocol;
  return noEndingColon.toUpperCase();
}

function getHostname(hostnameFromUrl: string | undefined): string {
  // An empty hostname is forwarded to `net`, which defaults it to localhost.
  return hostnameFromUrl || 'localhost';
}

function getHeaderAsString(headers: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = headers?.[key];
  if (value == null) {
    return undefined;
  }
  return Array.isArray(value) ? String(value[0]) : String(value);
}

/**
 * Diagnostics-channel-based `amqplib` integration.
 *
 * Subscribes to the `orchestrion:amqplib:*` diagnostics_channels that Sentry's code transform
 * injects into `amqplib`'s channel/connection methods. Requires the Sentry runtime hook or
 * bundler plugin to be active.
 */
export const amqplibIntegration = defineIntegration(_amqplibIntegration);
