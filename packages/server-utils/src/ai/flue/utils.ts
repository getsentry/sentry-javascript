import type { LRUMap, Span } from '@sentry/core';
import {
  captureException,
  isObjectLike,
  SPAN_STATUS_ERROR,
  startInactiveSpan,
  stringify,
  withActiveSpan,
} from '@sentry/core';
import {
  GEN_AI_CONVERSATION_ID,
  GEN_AI_OPERATION_NAME,
  GEN_AI_TOOL_CALL_ARGUMENTS,
  GEN_AI_TOOL_CALL_RESULT,
  GEN_AI_TOOL_NAME,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { getGenAiSpanOp } from '../core/utils';
import { piAiContentToString } from '../pi-ai/messages';
import { FLUE_ORIGIN, MAX_TRACKED_FLUE_SPANS } from './constants';
import type { FlueErrorInfo, FlueObservation } from './types';

/**
 * Flue persists the incoming W3C `traceparent` at admission and replays it on the agent operation.
 * Sentry's own propagation uses `sentry-trace`, so the carrier has to be converted before it can
 * continue the trace. Kept local until something else needs a W3C parser.
 */
export function sentryTraceFromTraceparent(traceparent: string): string | undefined {
  const [version, traceId, spanId, flags] = traceparent.split('-');
  if (version !== '00' || !traceId || !spanId || !flags) {
    return undefined;
  }
  // The sampled bit is the low bit of the flags byte; `% 2` avoids a bitwise operator.
  return `${traceId}-${spanId}-${parseInt(flags, 16) % 2 === 1 ? '1' : '0'}`;
}

/**
 * Turn and tool spans, keyed by the id of the work they cover. Bounded, because the key is only
 * removed when the matching end observation arrives and an abandoned stream never emits one.
 */
export type SpanTracker = LRUMap<string, Span>;

/**
 * Store a span under `key`. Callers only reach this with a key the tracker does not hold, so the
 * one span at risk of being dropped without `end()` is the oldest entry, which `LRUMap.set` silently
 * evicts once the tracker is full.
 */
function trackSpan(tracker: SpanTracker, key: string, span: Span): void {
  if (tracker.size >= MAX_TRACKED_FLUE_SPANS) {
    const oldestKey = tracker.keys()[0];
    if (oldestKey !== undefined) {
      tracker.remove(oldestKey)?.end();
    }
  }

  tracker.set(key, span);
}

/**
 * Report a failed tool as an error event.
 *
 * Flue catches whatever the tool threw and hands it back to the model as a tool result, so nothing
 * propagates for the SDK's global handlers to see: without this a throwing tool produces an errored
 * span and no issue at all. `errorInfo` carries the original name, message and stack, so rebuild an
 * `Error` from it rather than capturing the serialized shape.
 *
 * Tools only. A failed turn carries no `errorInfo` — a provider auth failure produces an errored
 * `chat` span and nothing to rebuild from — so there is no turn equivalent to capture.
 */
function captureToolError(span: Span, errorInfo: FlueErrorInfo | undefined): void {
  if (!errorInfo) {
    return;
  }

  const error = new Error(errorInfo.message ?? 'Flue tool failed');
  error.name = errorInfo.name ?? errorInfo.type ?? 'Error';
  if (errorInfo.stack) {
    error.stack = errorInfo.stack;
  }

  // Captured under the operation's own span so the issue lands on the right trace, matching how the
  // Mastra integration attaches its captures.
  withActiveSpan(span, () => {
    // Handled: this is not a rejection observed on a tracing channel, where the handled state is
    // unknowable. Flue caught the throw and returned it to the model as a tool result, so it is
    // definitively handled and no global hook will ever see it.
    captureException(error, { mechanism: { handled: true, type: FLUE_ORIGIN } });
  });
}

/**
 * Tool spans hang off the agent invocation rather than the turn, matching how Flue's own
 * OpenTelemetry adapter projects them: siblings of `chat`, correlated to model output by tool call
 * id. Keyed by `toolCallId` so concurrent tool calls in one turn cannot cross-attribute.
 */
export function startToolSpan(observation: FlueObservation, toolSpans: SpanTracker, recordInputs: boolean): void {
  const { toolCallId, toolName } = observation;
  if (!toolCallId || toolSpans.get(toolCallId)) {
    return;
  }

  trackSpan(
    toolSpans,
    toolCallId,
    startInactiveSpan({
      name: `execute_tool ${toolName ?? 'unknown'}`,
      op: getGenAiSpanOp('execute_tool'),
      attributes: {
        [SENTRY_ORIGIN]: FLUE_ORIGIN,
        [GEN_AI_OPERATION_NAME]: 'execute_tool',
        [GEN_AI_TOOL_NAME]: toolName,
        [GEN_AI_CONVERSATION_ID]: observation.conversationId,
        ...(recordInputs && observation.args !== undefined
          ? { [GEN_AI_TOOL_CALL_ARGUMENTS]: stringify(observation.args) }
          : {}),
      },
    }),
  );
}

export function endToolSpan(observation: FlueObservation, toolSpans: SpanTracker, recordOutputs: boolean): void {
  const { toolCallId } = observation;
  const span = toolCallId ? toolSpans.get(toolCallId) : undefined;
  if (!span || !toolCallId) {
    return;
  }
  toolSpans.remove(toolCallId);

  if (recordOutputs) {
    const result = toolResultForModel(observation);
    if (result !== undefined) {
      span.setAttribute(GEN_AI_TOOL_CALL_RESULT, result);
    }
  }

  if (observation.isError) {
    span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
    captureToolError(span, observation.errorInfo);
  }
  span.end();
}

/**
 * The result the model receives: Flue's `effectiveResult` when it has one, else the content blocks
 * of its harness-level `result` (`{ content, details }`, whose `details` payload is tool-specific).
 */
function toolResultForModel(observation: FlueObservation): string | undefined {
  const { effectiveResult } = observation;
  if (effectiveResult !== undefined) {
    if (typeof effectiveResult === 'string') {
      return effectiveResult;
    }
    return Array.isArray(effectiveResult) ? piAiContentToString(effectiveResult) : stringify(effectiveResult);
  }
  const { result } = observation;
  if (isObjectLike(result) && Array.isArray(result.content)) {
    return piAiContentToString(result.content);
  }
  return result === undefined ? undefined : stringify(result);
}
