import type { Span as OtelSpan } from '@opentelemetry/api';
import { tracingChannel as otelTracingChannel } from '@sentry/opentelemetry/tracing-channel';
import type { Span } from '@sentry/core';
import { debug } from '@sentry/core';
import type { _INTERNAL_VercelAiTracingChannelMessage } from '@sentry/core/server';
import {
  _INTERNAL_failVercelAiTracingChannelSpan,
  _INTERNAL_finishVercelAiTracingChannelSpan,
  _INTERNAL_startVercelAiTracingChannelSpan,
} from '@sentry/core/server';
import { DEBUG_BUILD } from '../../../debug-build';

const AI_SDK_TELEMETRY_TRACING_CHANNEL = 'ai:telemetry';

interface VercelAiTracingChannelContext extends _INTERNAL_VercelAiTracingChannelMessage {
  _sentrySpan?: OtelSpan;
}

let subscribed = false;

const NOOP = (): void => {};

/**
 * Subscribe to AI SDK v7 tracing-channel spans.
 *
 * AI SDK v3-v6 emit OpenTelemetry spans and are handled by `addVercelAiProcessors`.
 * AI SDK v7 emits lifecycle scopes via `node:diagnostics_channel.tracingChannel('ai:telemetry')`.
 */
export function subscribeVercelAiTracingChannel(): void {
  if (subscribed) {
    return;
  }

  subscribed = true;

  try {
    const channel = otelTracingChannel<_INTERNAL_VercelAiTracingChannelMessage>(
      AI_SDK_TELEMETRY_TRACING_CHANNEL,
      message => {
        return _INTERNAL_startVercelAiTracingChannelSpan(message) as unknown as OtelSpan;
      },
    );

    channel.subscribe({
      start: NOOP,
      end: NOOP,
      asyncStart: NOOP,
      asyncEnd: data => {
        const context = data as VercelAiTracingChannelContext;
        const span = context._sentrySpan as unknown as Span | undefined;
        if (!span || context.error) {
          return;
        }

        _INTERNAL_finishVercelAiTracingChannelSpan(span, context);
        span.end();
      },
      error: data => {
        const context = data as VercelAiTracingChannelContext;
        const span = context._sentrySpan as unknown as Span | undefined;
        if (!span) {
          return;
        }

        _INTERNAL_failVercelAiTracingChannelSpan(span, context);
        span.end();
      },
    });
  } catch (error) {
    DEBUG_BUILD && debug.log('Vercel AI tracing-channel subscription failed.', error);
  }
}
