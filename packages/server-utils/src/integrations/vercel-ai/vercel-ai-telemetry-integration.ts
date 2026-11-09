import { SENTRY_OP } from '@sentry/conventions/attributes';
import { GEN_AI_GENERATE_CONTENT } from '@sentry/conventions/op';
import { getActiveSpan, handleCallbackErrors, spanToJSON } from '@sentry/core';
import { GEN_AI_TOOL_CALL_ID_ATTRIBUTE } from '../../ai/core/gen-ai-attributes';
import * as dc from '../../utils/diagnosticsChannel';
import {
  AI_SDK_TELEMETRY_TRACING_CHANNEL,
  setFallbackChannelResult,
  type VercelAiChannelMessage,
} from './vercel-ai-dc-subscriber';

interface ToolOutput {
  type: 'tool-result' | 'tool-error';
  toolCallId: string;
  output?: unknown;
  error?: unknown;
}

/** The subset of `ai`'s `Telemetry` integration interface this uses. */
interface TelemetryIntegration {
  executeLanguageModelCall?<T>(options: Record<string, unknown> & { execute: () => PromiseLike<T> }): PromiseLike<T>;
  executeTool?<T>(
    options: Record<string, unknown> & { toolCallId: string; execute: () => PromiseLike<T> },
  ): PromiseLike<T>;
  onToolExecutionEnd?(event: { toolOutput: ToolOutput }): void;
}

const openToolCalls = new Map<string, { message: VercelAiChannelMessage; error?: unknown }>();

// `ai` >= 7.0.163 publishes no channel `result` for these calls.
function isRecordingOff(event: Record<string, unknown>): boolean {
  return event.recordInputs === false || event.recordOutputs === false;
}

/**
 * Register a global `ai` (>= 7) telemetry integration that covers what the `ai:telemetry` channel misses.
 * Frameworks such as eve (>= 0.84) run tools outside `ai`'s tool loop, so `ai` publishes nothing for them,
 * and `ai` >= 7.0.163 publishes no results for calls with `recordInputs`/`recordOutputs: false`.
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry
 */
export function registerVercelAiTelemetryIntegration(): void {
  const channel = dc.tracingChannel<VercelAiChannelMessage>(AI_SDK_TELEMETRY_TRACING_CHANNEL);
  const carrier = globalThis as { AI_SDK_TELEMETRY_INTEGRATIONS?: TelemetryIntegration[] };

  (carrier.AI_SDK_TELEMETRY_INTEGRATIONS ??= []).push({
    // Runs inside the `languageModelCall` channel span, unless that span was ignored.
    async executeLanguageModelCall({ execute, ...event }) {
      const span = isRecordingOff(event) ? getActiveSpan() : undefined;
      const result = await execute();
      if (span && spanToJSON(span).attributes?.[SENTRY_OP] === GEN_AI_GENERATE_CONTENT) {
        setFallbackChannelResult(span, result);
      }
      return result;
    },

    executeTool({ execute, ...event }) {
      // `ai`'s own tool loop calls this inside its own `executeTool` channel span.
      const activeSpan = getActiveSpan();
      if (activeSpan && spanToJSON(activeSpan).attributes?.[GEN_AI_TOOL_CALL_ID_ATTRIBUTE] === event.toolCallId) {
        return isRecordingOff(event)
          ? handleCallbackErrors(execute, error => {
              setFallbackChannelResult(activeSpan, { output: { type: 'tool-error', error } });
            })
          : execute();
      }

      // Also reached from `ai`'s own tool loop when its span is unsampled or ignored, where `toolOutput` is filtered.
      const call: { message: VercelAiChannelMessage; error?: unknown } = { message: { type: 'executeTool', event } };
      const { message } = call;
      openToolCalls.set(event.toolCallId, call);
      try {
        return channel.start.runStores(message, () =>
          handleCallbackErrors(execute, error => {
            call.error = error;
          }),
        );
      } finally {
        // Without a `result` this leaves the span open until `onToolExecutionEnd`.
        channel.end.publish(message);
      }
    },

    // The tool output only arrives here, after `execute` has settled.
    onToolExecutionEnd({ toolOutput }) {
      const call = openToolCalls.get(toolOutput.toolCallId);
      if (!call) {
        return;
      }
      openToolCalls.delete(toolOutput.toolCallId);
      const { message, error } = call;

      // Same result shape as `ai`'s own `executeTool` events, so the subscriber records the output or captures the error.
      // `ai` >= 7.0.163 replaces `toolOutput.error` with a generic error when recording is off.
      message.result = {
        output:
          toolOutput.type === 'tool-error' ? { ...toolOutput, error: error ?? toolOutput.error } : toolOutput.output,
      };
      channel.asyncEnd.publish(message);
    },
  });
}
