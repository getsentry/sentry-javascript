import type { Span } from '@sentry/core';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, SPAN_STATUS_ERROR, startInactiveSpan, stringify } from '@sentry/core';
import {
  GEN_AI_CONVERSATION_ID,
  GEN_AI_COST_CACHE_CREATION_INPUT_TOKENS,
  GEN_AI_COST_CACHE_READ_INPUT_TOKENS,
  GEN_AI_COST_INPUT_TOKENS,
  GEN_AI_COST_OUTPUT_TOKENS,
  GEN_AI_COST_TOTAL_TOKENS,
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OPERATION_NAME,
  GEN_AI_OUTPUT_MESSAGES,
  GEN_AI_PROVIDER_NAME,
  GEN_AI_REQUEST_MAX_TOKENS,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_REQUEST_REASONING_LEVEL,
  GEN_AI_REQUEST_TEMPERATURE,
  GEN_AI_RESPONSE_FINISH_REASONS,
  GEN_AI_RESPONSE_ID,
  GEN_AI_RESPONSE_MODEL,
  GEN_AI_SYSTEM_INSTRUCTIONS,
  GEN_AI_TOOL_CALL_ARGUMENTS,
  GEN_AI_TOOL_CALL_RESULT,
  GEN_AI_TOOL_DEFINITIONS,
  GEN_AI_TOOL_NAME,
  GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS,
  GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_USAGE_TOTAL_TOKENS,
  SERVER_ADDRESS,
  SERVER_PORT,
} from '@sentry/conventions/attributes';
import { getGenAiSpanOp } from '../core/utils';
import { FLUE_ORIGIN } from './constants';
import type { FlueModelRequestInfo, FlueObservation, FlueUsage } from './types';

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

export function startTurnSpan(observation: FlueObservation, turnSpans: Map<string, Span>): void {
  const { turnId } = observation;
  if (!turnId || turnSpans.has(turnId)) {
    return;
  }

  turnSpans.set(
    turnId,
    startInactiveSpan({
      name: 'chat',
      op: getGenAiSpanOp('chat'),
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: FLUE_ORIGIN,
        [GEN_AI_OPERATION_NAME]: 'chat',
        ...(observation.conversationId ? { [GEN_AI_CONVERSATION_ID]: observation.conversationId } : {}),
        // No conventional attribute for this; it is the only way to tell a compaction turn from a
        // user-facing one.
        ...(observation.purpose ? { 'flue.turn.purpose': observation.purpose } : {}),
      },
    }),
  );
}

export function endTurnSpan(observation: FlueObservation, turnSpans: Map<string, Span>, recordOutputs: boolean): void {
  const { turnId } = observation;
  const span = turnId ? turnSpans.get(turnId) : undefined;
  if (!span || !turnId) {
    return;
  }
  turnSpans.delete(turnId);

  const requestedModel = observation.request?.requestedModel;
  const responseModel = observation.response?.responseModel;
  const model = responseModel ?? requestedModel;
  if (model) {
    span.updateName(`chat ${model}`);
  }
  if (requestedModel) {
    span.setAttribute(GEN_AI_REQUEST_MODEL, requestedModel);
  }
  if (responseModel) {
    span.setAttribute(GEN_AI_RESPONSE_MODEL, responseModel);
  }

  // `providerId` is the slug (`anthropic`, `openrouter`); `providerName` is the display name.
  const provider = observation.request?.providerId;
  if (provider) {
    span.setAttribute(GEN_AI_PROVIDER_NAME, provider);
  }

  setRequestAttributes(span, observation.request);

  const { responseId, finishReason } = observation.response ?? {};
  if (responseId) {
    span.setAttribute(GEN_AI_RESPONSE_ID, responseId);
  }
  if (finishReason) {
    span.setAttribute(GEN_AI_RESPONSE_FINISH_REASONS, [finishReason]);
  }

  const output = observation.response?.output;
  if (recordOutputs && output !== undefined) {
    span.setAttribute(GEN_AI_OUTPUT_MESSAGES, stringify(output));
  }

  setUsageAttributes(span, observation.response?.usage, observation.isError);

  if (observation.isError) {
    span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
  }
  span.end();
}

/**
 * Flue reports token counts and its own computed costs on the same `usage` object, so both are set
 * here. The cost figures have no equivalent in the provider SDKs' own instrumentation.
 */
export function setUsageAttributes(span: Span, usage: FlueUsage | undefined, isError?: boolean): void {
  // A turn that failed before the provider billed anything reports every counter as 0. Writing
  // those is noise that reads as a real zero-cost call, so skip the block entirely.
  if (!usage || (isError && !usage.totalTokens)) {
    return;
  }

  const attributes: Record<string, number> = {};
  const set = (key: string, value: number | undefined): void => {
    if (typeof value === 'number') {
      attributes[key] = value;
    }
  };

  set(GEN_AI_USAGE_INPUT_TOKENS, usage.input);
  set(GEN_AI_USAGE_OUTPUT_TOKENS, usage.output);
  set(GEN_AI_USAGE_TOTAL_TOKENS, usage.totalTokens);
  set(GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS, usage.cacheRead);
  set(GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS, usage.cacheWrite);

  set(GEN_AI_COST_INPUT_TOKENS, usage.cost?.input);
  set(GEN_AI_COST_OUTPUT_TOKENS, usage.cost?.output);
  set(GEN_AI_COST_TOTAL_TOKENS, usage.cost?.total);
  set(GEN_AI_COST_CACHE_READ_INPUT_TOKENS, usage.cost?.cacheRead);
  set(GEN_AI_COST_CACHE_CREATION_INPUT_TOKENS, usage.cost?.cacheWrite);

  span.setAttributes(attributes);
}

/**
 * Tool spans hang off the agent invocation rather than the turn, matching how Flue's own
 * OpenTelemetry adapter projects them: siblings of `chat`, correlated to model output by tool call
 * id. Keyed by `toolCallId` so concurrent tool calls in one turn cannot cross-attribute.
 */
export function startToolSpan(observation: FlueObservation, toolSpans: Map<string, Span>, recordInputs: boolean): void {
  const { toolCallId, toolName } = observation;
  if (!toolCallId || toolSpans.has(toolCallId)) {
    return;
  }

  toolSpans.set(
    toolCallId,
    startInactiveSpan({
      name: `execute_tool ${toolName ?? 'unknown'}`,
      op: getGenAiSpanOp('execute_tool'),
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: FLUE_ORIGIN,
        [GEN_AI_OPERATION_NAME]: 'execute_tool',
        ...(toolName ? { [GEN_AI_TOOL_NAME]: toolName } : {}),
        ...(observation.conversationId ? { [GEN_AI_CONVERSATION_ID]: observation.conversationId } : {}),
        ...(recordInputs && observation.args !== undefined
          ? { [GEN_AI_TOOL_CALL_ARGUMENTS]: stringify(observation.args) }
          : {}),
      },
    }),
  );
}

export function endToolSpan(observation: FlueObservation, toolSpans: Map<string, Span>, recordOutputs: boolean): void {
  const { toolCallId } = observation;
  const span = toolCallId ? toolSpans.get(toolCallId) : undefined;
  if (!span || !toolCallId) {
    return;
  }
  toolSpans.delete(toolCallId);

  if (recordOutputs && observation.result !== undefined) {
    span.setAttribute(GEN_AI_TOOL_CALL_RESULT, stringify(observation.result));
  }

  if (observation.isError) {
    span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
  }
  span.end();
}

/**
 * `turn_request` is the only event carrying the request's content — the settled `turn` reports
 * metadata alone — so input messages, system prompt and tool definitions are read from it.
 */
export function recordRequestContent(observation: FlueObservation, turnSpans: Map<string, Span>): void {
  const { turnId } = observation;
  const span = turnId ? turnSpans.get(turnId) : undefined;
  const input = observation.request?.input;
  if (!span || !input) {
    return;
  }

  if (input.systemPrompt) {
    span.setAttribute(GEN_AI_SYSTEM_INSTRUCTIONS, input.systemPrompt);
  }
  if (input.messages) {
    span.setAttribute(GEN_AI_INPUT_MESSAGES, stringify(input.messages));
  }
  if (input.tools?.length) {
    span.setAttribute(GEN_AI_TOOL_DEFINITIONS, stringify(input.tools));
  }
}

/**
 * Model-call tuning and the provider endpoint, all on the settled turn's `ModelRequestInfo`. These
 * are the conventional attributes the other AI integrations in this package set.
 */
export function setRequestAttributes(span: Span, request: FlueModelRequestInfo | undefined): void {
  if (!request) {
    return;
  }

  const attributes: Record<string, string | number> = {};
  const set = (key: string, value: string | number | undefined): void => {
    if (value !== undefined) {
      attributes[key] = value;
    }
  };

  set(GEN_AI_REQUEST_TEMPERATURE, request.temperature);
  set(GEN_AI_REQUEST_MAX_TOKENS, request.maxTokens);
  set(GEN_AI_REQUEST_REASONING_LEVEL, request.reasoningLevel);
  set(SERVER_ADDRESS, request.serverAddress);
  set(SERVER_PORT, request.serverPort);

  span.setAttributes(attributes);
}
