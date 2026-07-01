import * as diagnosticsChannel from 'node:diagnostics_channel';
import type { IntegrationFn, OpenAiOptions, Span, SpanAttributeValue } from '@sentry/core';
import {
  addRequestAttributes,
  addResponseAttributes,
  debug,
  defineIntegration,
  extractRequestAttributes,
  resolveAIRecordingOptions,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  shouldEnableTruncation,
  startInactiveSpan,
  waitForTracingChannelBinding,
} from '@sentry/core';
import { DEBUG_BUILD } from '../../debug-build';
import { CHANNELS } from '../../orchestrion/channels';
import { bindTracingChannelToSpan } from '../../tracing-channel';

// Same name as the OTel integration by design: when enabled, the OTel 'OpenAI'
// integration is dropped from the default set (see the Node opt-in loader).
const INTEGRATION_NAME = 'OpenAI' as const;

// Distinct from the proxy's `auto.ai.openai` so spans from the orchestrion path
// are attributable separately from the OTel/proxy one.
const ORIGIN = 'auto.ai.orchestrion.openai';

const OPERATION = 'chat';

/**
 * The context object orchestrion shares across the tracing-channel lifecycle hooks: `arguments` is the
 * live args array passed to `Completions.create(body, options)`, and Node's `tracingChannel` attaches
 * `result` when the returned promise settles.
 */
interface OpenAiChatChannelContext {
  arguments: unknown[];
  result?: unknown;
}

let subscribed = false;

const _openaiChannelIntegration = ((options: OpenAiOptions = {}) => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      // `tracingChannel` is unavailable before Node 18.19, and a second `init()` would double-subscribe.
      if (!diagnosticsChannel.tracingChannel || subscribed) {
        return;
      }
      subscribed = true;

      DEBUG_BUILD && debug.log(`[orchestrion:openai] subscribing to channel "${CHANNELS.OPENAI_CHAT}"`);

      // `bindTracingChannelToSpan` needs the async-context binding that `initOpenTelemetry()` registers
      // after `setupOnce` runs, so wait for it before subscribing.
      waitForTracingChannelBinding(() => {
        bindTracingChannelToSpan(
          diagnosticsChannel.tracingChannel<OpenAiChatChannelContext>(CHANNELS.OPENAI_CHAT),
          data => createChatSpan(data, options),
          {
            beforeSpanEnd: (span, data) => {
              if ('result' in data) {
                addResponseAttributes(span, data.result, resolveAIRecordingOptions(options).recordOutputs);
              }
            },
            captureError: () => ({ mechanism: { type: ORIGIN, handled: false } }),
          },
        );
      });
    },
  };
}) satisfies IntegrationFn;

/**
 * Build the span for a `chat.completions.create` call, reusing the same core attribute helpers as the
 * proxy-based instrumentation. Streaming (`stream: true`) is out of scope for now: its span must live
 * until the returned stream is fully consumed, which `bindTracingChannelToSpan`'s end-on-asyncEnd
 * lifecycle can't express — returning `undefined` opts the payload out so no (mis-timed) span is opened.
 */
function createChatSpan(data: OpenAiChatChannelContext, options: OpenAiOptions): Span | undefined {
  const args = data.arguments ?? [];
  const params = args[0] as Record<string, unknown> | undefined;

  if (params?.stream === true) {
    return undefined;
  }

  const { recordInputs } = resolveAIRecordingOptions(options);
  const enableTruncation = shouldEnableTruncation(options.enableTruncation);

  const attributes = extractRequestAttributes(args, OPERATION);
  attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN] = ORIGIN;
  const model = (params?.model as string) || 'unknown';

  const span = startInactiveSpan({
    name: `${OPERATION} ${model}`,
    op: `gen_ai.${OPERATION}`,
    attributes: attributes as Record<string, SpanAttributeValue>,
  });

  if (recordInputs && params) {
    addRequestAttributes(span, params, OPERATION, enableTruncation);
  }

  return span;
}

/**
 * EXPERIMENTAL — orchestrion-driven OpenAI integration. Subscribes to the `orchestrion:openai:chat`
 * diagnostics_channel injected into `openai`'s `Completions.prototype.create`, so it requires the
 * orchestrion runtime hook or bundler plugin. Covers non-streaming `chat.completions.create`; streaming
 * and the other methods are follow-ups. Browser/edge keep using the proxy `instrumentOpenAiClient`.
 */
export const openaiChannelIntegration = defineIntegration(_openaiChannelIntegration);
