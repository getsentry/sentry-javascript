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

// Each instrumented `create` method maps to the gen_ai operation its span reports.
const INSTRUMENTED_CHANNELS = [
  { channel: CHANNELS.OPENAI_CHAT, operation: 'chat' },
  { channel: CHANNELS.OPENAI_RESPONSES, operation: 'chat' },
  { channel: CHANNELS.OPENAI_EMBEDDINGS, operation: 'embeddings' },
] as const;

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

      // `bindTracingChannelToSpan` needs the async-context binding that `initOpenTelemetry()` registers
      // after `setupOnce` runs, so wait for it before subscribing.
      waitForTracingChannelBinding(() => {
        for (const { channel, operation } of INSTRUMENTED_CHANNELS) {
          DEBUG_BUILD && debug.log(`[orchestrion:openai] subscribing to channel "${channel}"`);
          bindTracingChannelToSpan(
            diagnosticsChannel.tracingChannel<OpenAiChatChannelContext>(channel),
            data => createGenAiSpan(data, operation, options),
            {
              beforeSpanEnd: (span, data) => {
                if ('result' in data) {
                  addResponseAttributes(span, data.result, resolveAIRecordingOptions(options).recordOutputs);
                }
              },
              captureError: () => ({ mechanism: { type: ORIGIN, handled: false } }),
            },
          );
        }
      });
    },
  };
}) satisfies IntegrationFn;

/**
 * Build the span for an instrumented `create` call.
 * Returning `undefined` opts the payload out so no span is opened.
 */
function createGenAiSpan(data: OpenAiChatChannelContext, operation: string, options: OpenAiOptions): Span | undefined {
  const args = data.arguments ?? [];
  const params = args[0] as Record<string, unknown> | undefined;

  // streaming is not supported
  if (params?.stream === true) {
    return undefined;
  }

  const { recordInputs } = resolveAIRecordingOptions(options);
  const enableTruncation = shouldEnableTruncation(options.enableTruncation);

  const attributes = extractRequestAttributes(args, operation);
  attributes[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN] = ORIGIN;
  const model = (params?.model as string) || 'unknown';

  const span = startInactiveSpan({
    name: `${operation} ${model}`,
    op: `gen_ai.${operation}`,
    attributes: attributes as Record<string, SpanAttributeValue>,
  });

  if (recordInputs && params) {
    addRequestAttributes(span, params, operation, enableTruncation);
  }

  return span;
}

/**
 * EXPERIMENTAL — orchestrion-driven OpenAI integration. Subscribes to the `orchestrion:openai:*`
 * diagnostics_channels injected into `openai`'s `create` methods, so it requires the orchestrion runtime
 * hook or bundler plugin. Covers non-streaming `chat.completions.create` and `responses.create`.
 */
export const openaiChannelIntegration = defineIntegration(_openaiChannelIntegration);
