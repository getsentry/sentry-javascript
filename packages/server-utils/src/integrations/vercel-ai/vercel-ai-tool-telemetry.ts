import { getActiveSpan, spanToJSON } from '@sentry/core';
import { GEN_AI_TOOL_CALL_ID_ATTRIBUTE } from '../../ai/core/gen-ai-attributes';
import * as dc from '../../utils/diagnosticsChannel';
import { AI_SDK_TELEMETRY_TRACING_CHANNEL, type VercelAiChannelMessage } from './vercel-ai-dc-subscriber';

interface ToolOutput {
  type: 'tool-result' | 'tool-error';
  toolCallId: string;
  output?: unknown;
}

/** The subset of `ai`'s `Telemetry` integration interface this uses. */
interface TelemetryIntegration {
  executeTool?<T>(
    options: Record<string, unknown> & { toolCallId: string; execute: () => PromiseLike<T> },
  ): PromiseLike<T>;
  onToolExecutionEnd?(event: { toolOutput: ToolOutput }): void;
}

const openToolCalls = new Map<string, VercelAiChannelMessage>();

/**
 * Register a global `ai` (>= 7) telemetry integration that publishes tool executions to the
 * `ai:telemetry` channel. Frameworks such as eve (>= 0.84) run tools outside `ai`'s tool loop, so `ai`
 * publishes nothing for them, but they still call registered telemetry integrations.
 * @see https://ai-sdk.dev/docs/ai-sdk-core/telemetry
 */
export function registerVercelAiToolTelemetry(): void {
  const channel = dc.tracingChannel<VercelAiChannelMessage>(AI_SDK_TELEMETRY_TRACING_CHANNEL);
  const carrier = globalThis as { AI_SDK_TELEMETRY_INTEGRATIONS?: TelemetryIntegration[] };

  (carrier.AI_SDK_TELEMETRY_INTEGRATIONS ??= []).push({
    executeTool({ execute, ...event }) {
      // `ai`'s own tool loop calls this inside its own `executeTool` channel span.
      const activeSpan = getActiveSpan();
      if (activeSpan && spanToJSON(activeSpan).attributes?.[GEN_AI_TOOL_CALL_ID_ATTRIBUTE] === event.toolCallId) {
        return execute();
      }

      const message: VercelAiChannelMessage = { type: 'executeTool', event };
      openToolCalls.set(event.toolCallId, message);
      try {
        return channel.start.runStores(message, execute);
      } finally {
        // Without a `result` this leaves the span open until `onToolExecutionEnd`.
        channel.end.publish(message);
      }
    },

    // The tool output only arrives here, after `execute` has settled.
    onToolExecutionEnd({ toolOutput }) {
      const message = openToolCalls.get(toolOutput.toolCallId);
      if (!message) {
        return;
      }
      openToolCalls.delete(toolOutput.toolCallId);

      // Same result shape as `ai`'s own `executeTool` events, so the subscriber records the output or captures the error.
      message.result = { output: toolOutput.type === 'tool-error' ? toolOutput : toolOutput.output };
      channel.asyncEnd.publish(message);
    },
  });
}
