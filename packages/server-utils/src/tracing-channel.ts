import type { TracingChannel, TracingChannelSubscribers } from 'node:diagnostics_channel';
import type { AsyncLocalStorage } from 'node:async_hooks';
import type { Span } from '@sentry/core';
import { _INTERNAL_getTracingChannelBinding, debug, captureException, SPAN_STATUS_ERROR } from '@sentry/core';
import { DEBUG_BUILD } from './debug-build';

export type TracingChannelPayloadWithSpan<TData extends object> = TData & {
  _sentrySpan?: Span;
};

/*
 * A type patch so that we don't have to handle all subscription types.
 */
export interface SentryTracingChannel<TData extends object = object> extends Omit<
  TracingChannel<TData, TracingChannelPayloadWithSpan<TData>>,
  'subscribe' | 'unsubscribe'
> {
  subscribe(subscribers: Partial<TracingChannelSubscribers<TracingChannelPayloadWithSpan<TData>>>): void;
  unsubscribe(subscribers: Partial<TracingChannelSubscribers<TracingChannelPayloadWithSpan<TData>>>): void;
}

export interface TracingChannelBindingOptions {
  lifecycle: 'auto' | 'manual';
}

const NOOP = () => {};

export function bindTracingChannelToSpan<TData extends object>(
  channel: TracingChannel<TData, TData>,
  getSpan: (data: TracingChannelPayloadWithSpan<TData>) => Span,
  opts?: Partial<TracingChannelBindingOptions>,
): SentryTracingChannel<TData> {
  const binding = _INTERNAL_getTracingChannelBinding();

  if (!binding) {
    DEBUG_BUILD && debug.log('[TracingChannel] Could not access async context binding.');
    return channel as SentryTracingChannel<TData>;
  }

  channel.start.bindStore(
    binding.asyncLocalStorage as AsyncLocalStorage<TData>,
    (data: TracingChannelPayloadWithSpan<TData>) => {
      const span = getSpan(data);
      data._sentrySpan = span;

      return binding.getStoreWithActiveSpan(span) as TData;
    },
  );

  const sentryChannel = channel as SentryTracingChannel<TData>;

  if (opts?.lifecycle === 'manual') {
    return sentryChannel;
  }

  sentryChannel.subscribe({
    start: NOOP,
    asyncStart: NOOP,
    end(data) {
      // The operation settled synchronously (returned or threw)
      // Presence checks because caller can return `undefined` result or throw a falsy value.
      if ('error' in data || 'result' in data) {
        data._sentrySpan?.end();
      }
    },
    error(data) {
      captureException(data.error, {
        mechanism: {
          type: 'auto.diagnostic_channels.bind_span',
        },
      });
      data._sentrySpan?.setStatus({ code: SPAN_STATUS_ERROR, message: String(data.error) });
    },
    asyncEnd(data) {
      data._sentrySpan?.end();
    },
  });

  return sentryChannel;
}
