/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-amqplib
 * - Upstream version: @opentelemetry/instrumentation-amqplib@0.65.0
 * - The channel/connection patches were extracted from the instrumentation class into standalone factories
 *   and migrated to Sentry's span APIs; origin is folded into span creation instead of `index.ts` hooks
 * - Cross-service trace propagation uses Sentry's `getTraceData`/`continueTrace` instead of the OTel propagator
 * - Replaced the OTel context-key confirm-channel marker with a synchronous flag on the channel instance
 * - Dropped the instrumentation config and all hooks (publish/publishConfirm/consume/consumeEnd) and the
 *   `useLinksForConsume` path; the SDK never used them
 */

import { continueTrace, SPAN_STATUS_ERROR, timestampInSeconds, withActiveSpan } from '@sentry/core';
import type { Connection, Options, Replies } from './amqplib-types';
import { EndOperation, type ConsumeMessage, type Message } from './types';
import type {
  InstrumentationConnection,
  InstrumentationConsumeChannel,
  InstrumentationConsumeMessage,
  InstrumentationMessage,
  InstrumentationPublishChannel,
} from './utils';
import {
  CHANNEL_CONSUME_TIMEOUT_TIMER,
  CHANNEL_IS_CONFIRM_PUBLISHING,
  CHANNEL_SPANS_NOT_ENDED,
  CONNECTION_ATTRIBUTES,
  getConnectionAttributesFromServer,
  getConnectionAttributesFromUrl,
  getHeaderAsString,
  MESSAGE_STORED_SPAN,
  startConsumeSpan,
  startPublishSpan,
} from './utils';

// To prevent reference leaks from un-acked messages, their spans are closed after this timeout. The
// upstream instrumentation exposed this as the `consumeTimeoutMs` option; the SDK always used the default.
const CONSUME_TIMEOUT_MS = 1000 * 60; // 1 minute

function endConsumerSpan(
  message: InstrumentationMessage,
  isRejected: boolean | null,
  operation: EndOperation,
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
        operation !== EndOperation.ChannelClosed && operation !== EndOperation.ChannelError
          ? `${operation} called on message${
              requeue === true ? ' with requeue' : requeue === false ? ' without requeue' : ''
            }`
          : operation,
    });
  }
  storedSpan.end();
  message[MESSAGE_STORED_SPAN] = undefined;
}

function endAllSpansOnChannel(
  channel: InstrumentationConsumeChannel,
  isRejected: boolean,
  operation: EndOperation,
  requeue: boolean | undefined,
): void {
  const spansNotEnded: { msg: Message }[] = channel[CHANNEL_SPANS_NOT_ENDED] ?? [];
  spansNotEnded.forEach(msgDetails => {
    endConsumerSpan(msgDetails.msg, isRejected, operation, requeue);
  });
  channel[CHANNEL_SPANS_NOT_ENDED] = [];
}

function checkConsumeTimeoutOnChannel(channel: InstrumentationConsumeChannel): void {
  const currentTime = timestampInSeconds();
  const spansNotEnded = channel[CHANNEL_SPANS_NOT_ENDED] ?? [];
  let i: number;
  for (i = 0; i < spansNotEnded.length; i++) {
    const currMessage = spansNotEnded[i]!;
    const timeFromConsumeMs = (currentTime - currMessage.timeOfConsume) * 1000;
    if (timeFromConsumeMs < CONSUME_TIMEOUT_MS) {
      break;
    }
    endConsumerSpan(currMessage.msg, null, EndOperation.InstrumentationTimeout, true);
  }
  spansNotEnded.splice(0, i);
}

export function getConnectPatch(
  original: (
    url: string | Options.Connect,
    socketOptions: any,
    openCallback: (err: any, connection: Connection) => void,
  ) => Connection,
) {
  return function patchedConnect(
    this: unknown,
    url: string | Options.Connect,
    socketOptions: any,
    openCallback: Function,
  ): Connection {
    return original.call(this, url, socketOptions, function (this: unknown, err: any, conn: InstrumentationConnection) {
      if (err == null) {
        const urlAttributes = getConnectionAttributesFromUrl(url);
        const serverAttributes = getConnectionAttributesFromServer(conn);
        conn[CONNECTION_ATTRIBUTES] = {
          ...urlAttributes,
          ...serverAttributes,
        };
      }
      openCallback.apply(this, arguments);
    });
  };
}

export function getChannelEmitPatch(original: Function) {
  return function emit(this: InstrumentationConsumeChannel, eventName: string): void {
    if (eventName === 'close') {
      endAllSpansOnChannel(this, true, EndOperation.ChannelClosed, undefined);
      const activeTimer = this[CHANNEL_CONSUME_TIMEOUT_TIMER];
      if (activeTimer) {
        clearInterval(activeTimer);
      }
      this[CHANNEL_CONSUME_TIMEOUT_TIMER] = undefined;
    } else if (eventName === 'error') {
      endAllSpansOnChannel(this, true, EndOperation.ChannelError, undefined);
    }
    return original.apply(this, arguments);
  };
}

export function getAckAllPatch(isRejected: boolean, endOperation: EndOperation) {
  return (original: Function) =>
    function ackAll(this: InstrumentationConsumeChannel, requeueOrEmpty?: boolean): void {
      endAllSpansOnChannel(this, isRejected, endOperation, requeueOrEmpty);
      return original.apply(this, arguments);
    };
}

export function getAckPatch(isRejected: boolean, endOperation: EndOperation) {
  return (original: Function) =>
    function ack(
      this: InstrumentationConsumeChannel,
      message: Message,
      allUpToOrRequeue?: boolean,
      requeue?: boolean,
    ): void {
      const channel = this;
      // we use this patch in the reject function as well, but it has a different signature
      const requeueResolved = endOperation === EndOperation.Reject ? allUpToOrRequeue : requeue;

      const spansNotEnded: { msg: Message }[] = channel[CHANNEL_SPANS_NOT_ENDED] ?? [];
      const msgIndex = spansNotEnded.findIndex(msgDetails => msgDetails.msg === message);
      if (msgIndex < 0) {
        // should not happen in the happy flow, but possible if the user calls ack twice with the same message
        endConsumerSpan(message, isRejected, endOperation, requeueResolved);
      } else if (endOperation !== EndOperation.Reject && allUpToOrRequeue) {
        for (let i = 0; i <= msgIndex; i++) {
          endConsumerSpan(spansNotEnded[i]!.msg, isRejected, endOperation, requeueResolved);
        }
        spansNotEnded.splice(0, msgIndex + 1);
      } else {
        endConsumerSpan(message, isRejected, endOperation, requeueResolved);
        spansNotEnded.splice(msgIndex, 1);
      }
      return original.apply(this, arguments);
    };
}

export function getConsumePatch(original: Function) {
  return function consume(
    this: InstrumentationConsumeChannel,
    queue: string,
    onMessage: (msg: ConsumeMessage | null) => void,
    options?: Options.Consume,
  ): Promise<Replies.Consume> {
    const channel = this;
    if (!Object.prototype.hasOwnProperty.call(channel, CHANNEL_SPANS_NOT_ENDED)) {
      const timer = setInterval(() => {
        checkConsumeTimeoutOnChannel(channel);
      }, CONSUME_TIMEOUT_MS);
      timer.unref();
      channel[CHANNEL_CONSUME_TIMEOUT_TIMER] = timer;
      channel[CHANNEL_SPANS_NOT_ENDED] = [];
    }

    const patchedOnMessage = function (this: unknown, msg: InstrumentationConsumeMessage | null): void {
      // msg is expected to be null for a consumer cancel notification
      // https://www.rabbitmq.com/consumer-cancel.html
      // in this case, we do not start a span, as this is not a real message.
      if (!msg) {
        return onMessage.call(this, msg);
      }

      const headers = msg.properties.headers ?? {};
      const sentryTrace = getHeaderAsString(headers, 'sentry-trace');
      const baggage = getHeaderAsString(headers, 'baggage');

      // Continue the producer's trace so the consumer span is parented to the message's producer.
      continueTrace({ sentryTrace, baggage }, () => {
        const span = startConsumeSpan(queue, msg, channel);

        if (!options?.noAck) {
          // store the message on the channel so we can close the span on ackAll etc
          channel[CHANNEL_SPANS_NOT_ENDED]!.push({ msg, timeOfConsume: timestampInSeconds() });
          // store the span on the message so we can end it when the user calls 'ack' on it
          msg[MESSAGE_STORED_SPAN] = span;
        }
        withActiveSpan(span, () => {
          onMessage.call(this, msg);
        });

        if (options?.noAck) {
          span.end();
        }
      });
    };

    // Copy `arguments` instead of mutating it: in CJS builds it's aliased to the named parameters,
    // so `arguments[1] = ...` would also reassign `onMessage` to `patchedOnMessage`, making the wrapper
    // call itself and recurse infinitely.
    const callArgs = Array.prototype.slice.call(arguments);
    callArgs[1] = patchedOnMessage;
    return original.apply(this, callArgs);
  };
}

export function getConfirmedPublishPatch(original: Function) {
  return function confirmedPublish(
    this: InstrumentationPublishChannel,
    exchange: string,
    routingKey: string,
    content: Buffer,
    options?: Options.Publish,
    callback?: (err: any, ok: Replies.Empty) => void,
  ): boolean {
    const channel = this;
    const { span, modifiedOptions } = startPublishSpan(exchange, routingKey, channel, options);

    const patchedOnConfirm = function (this: unknown, err: any, ok: Replies.Empty): void {
      try {
        withActiveSpan(span, () => {
          callback?.call(this, err, ok);
        });
      } finally {
        if (err) {
          span.setStatus({ code: SPAN_STATUS_ERROR, message: "message confirmation has been nack'ed" });
        }
        span.end();
      }
    };

    // The confirm channel publish stores the message and registers a broker-confirm callback; the span
    // ends in that callback. The confirm publish internally delegates to the base channel publish, so we
    // flag the channel to stop the base publish patch from creating a second span. The inner call is
    // synchronous, so a flag on the instance is enough and avoids the OTel context machinery.
    const argumentsCopy = [...arguments];
    argumentsCopy[3] = modifiedOptions;
    argumentsCopy[4] = patchedOnConfirm;
    channel[CHANNEL_IS_CONFIRM_PUBLISHING] = true;
    try {
      return original.apply(this, argumentsCopy);
    } finally {
      channel[CHANNEL_IS_CONFIRM_PUBLISHING] = false;
    }
  };
}

export function getPublishPatch(original: Function) {
  return function publish(
    this: InstrumentationPublishChannel,
    exchange: string,
    routingKey: string,
    content: Buffer,
    options?: Options.Publish,
  ): boolean {
    if (this[CHANNEL_IS_CONFIRM_PUBLISHING]) {
      // already instrumented by the confirm-channel publish patch
      return original.apply(this, arguments);
    }
    const channel = this;
    const { span, modifiedOptions } = startPublishSpan(exchange, routingKey, channel, options);

    // calling the normal channel publish function only stores the message in the queue; it does not send
    // it and wait for an ack, so the span duration is expected to be very short.
    const argumentsCopy = [...arguments];
    argumentsCopy[3] = modifiedOptions;
    const originalRes = original.apply(this, argumentsCopy);
    span.end();
    return originalRes;
  };
}
