import type { Span } from '@sentry/core';
import {
  _INTERNAL_skipAiProviderWrapping,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SPAN_STATUS_ERROR,
  startInactiveSpan,
  startSpan,
  stringify,
  withActiveSpan,
} from '@sentry/core';
import {
  GEN_AI_AGENT_NAME,
  GEN_AI_CONVERSATION_ID,
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OUTPUT_MESSAGES,
  GEN_AI_COST_CACHE_CREATION_INPUT_TOKENS,
  GEN_AI_COST_CACHE_READ_INPUT_TOKENS,
  GEN_AI_COST_INPUT_TOKENS,
  GEN_AI_COST_OUTPUT_TOKENS,
  GEN_AI_COST_TOTAL_TOKENS,
  GEN_AI_OPERATION_NAME,
  GEN_AI_PROVIDER_NAME,
  GEN_AI_REQUEST_MODEL,
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
} from '@sentry/conventions/attributes';
import { ANTHROPIC_AI_INTEGRATION_NAME } from '../anthropic-ai/constants';
import type { GenAiOptions } from '../core/utils';
import { getGenAiSpanOp, resolveAIRecordingOptions } from '../core/utils';
import { GOOGLE_GENAI_INTEGRATION_NAME } from '../google-genai/constants';
import { OPENAI_INTEGRATION_NAME } from '../openai/constants';
import { FLUE_INSTRUMENTATION_KEY, FLUE_ORIGIN, SPANNED_OPERATION_TYPE } from './constants';
import type { FlueInstrumentation, FlueObservation, FlueUsage } from './types';

export type FlueOptions = GenAiOptions;

const SKIPPED_PROVIDERS = [OPENAI_INTEGRATION_NAME, ANTHROPIC_AI_INTEGRATION_NAME, GOOGLE_GENAI_INTEGRATION_NAME];

/**
 * Build the object to hand to `instrument()` from `@flue/runtime`.
 *
 * The two callbacks own different halves of the result:
 *
 * - `interceptor` wraps agent execution, so the agent span is *active* for its duration and every
 *   span opened underneath parents correctly.
 * - `observe` opens and closes the turn span, because Flue's `turn_start`/`turn` events are the
 *   only one-to-one signal for a model call and `turn` is what carries usage and cost.
 *
 * Message content, tool arguments and tool results are gated on `recordInputs`/`recordOutputs`,
 * which fall back to the client's `dataCollection.genAI` settings.
 */
export function createFlueInstrumentation(options: FlueOptions = {}): FlueInstrumentation {
  // Flue drives the providers through `@earendil-works/pi-ai`, which bundles the `openai`,
  // `@anthropic-ai/sdk` and `@google/genai` clients. Left alone they instrument the same call this
  // reports as a turn, emitting a second `gen_ai.chat` beside ours. Done here rather than in
  // `flueIntegration` so registering by hand — the only option on Cloudflare, where agents run in
  // per-Durable-Object isolates — gets it too.
  _INTERNAL_skipAiProviderWrapping(SKIPPED_PROVIDERS);

  const { recordInputs, recordOutputs } = resolveAIRecordingOptions(options);
  const turnSpans = new Map<string, Span>();
  const toolSpans = new Map<string, Span>();
  let agentSpan: Span | undefined;
  let agentDepth = 0;

  return {
    key: FLUE_INSTRUMENTATION_KEY,

    interceptor: async (operation, ctx, next) => {
      if (operation?.type !== SPANNED_OPERATION_TYPE) {
        return next();
      }

      // A submission's agent operation re-enters once, and the two carry different halves of the
      // agent's identity: the outer context names the agent, the inner one names the conversation.
      // Only the outer becomes a span, so the conversation id is lifted onto it from the re-entry.
      if (agentDepth++ > 0) {
        if (ctx.conversationId) {
          agentSpan?.setAttribute(GEN_AI_CONVERSATION_ID, ctx.conversationId);
        }
        try {
          return await next();
        } finally {
          agentDepth--;
        }
      }

      return startSpan(
        {
          name: `invoke_agent ${ctx.agentName ?? 'agent'}`,
          op: getGenAiSpanOp('invoke_agent'),
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: FLUE_ORIGIN,
            [GEN_AI_OPERATION_NAME]: 'invoke_agent',
            ...(ctx.agentName ? { [GEN_AI_AGENT_NAME]: ctx.agentName } : {}),
            ...(ctx.conversationId ? { [GEN_AI_CONVERSATION_ID]: ctx.conversationId } : {}),
          },
        },
        async span => {
          agentSpan = span;
          try {
            return await next();
          } finally {
            agentDepth--;
            agentSpan = undefined;
          }
        },
      );
    },

    observe: observation => {
      switch (observation.type) {
        case 'turn_start':
          startTurnSpan(observation, turnSpans, agentSpan);
          return;
        case 'turn_request':
          if (recordInputs) {
            recordRequestContent(observation, turnSpans);
          }
          return;
        case 'turn':
          endTurnSpan(observation, turnSpans, recordOutputs);
          return;
        case 'tool_start':
          startToolSpan(observation, toolSpans, agentSpan, recordInputs);
          return;
        case 'tool':
          endToolSpan(observation, toolSpans, recordOutputs);
          return;
        default:
          return;
      }
    },

    dispose: () => {
      for (const span of [...turnSpans.values(), ...toolSpans.values()]) {
        span.end();
      }
      turnSpans.clear();
      toolSpans.clear();
    },
  };
}

function startTurnSpan(observation: FlueObservation, turnSpans: Map<string, Span>, agentSpan: Span | undefined): void {
  const { turnId } = observation;
  if (!turnId || turnSpans.has(turnId)) {
    return;
  }

  const open = (): Span =>
    startInactiveSpan({
      name: 'chat',
      op: getGenAiSpanOp('chat'),
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: FLUE_ORIGIN,
        [GEN_AI_OPERATION_NAME]: 'chat',
        ...(observation.conversationId ? { [GEN_AI_CONVERSATION_ID]: observation.conversationId } : {}),
      },
    });

  // `observe` runs inside the agent operation, but the active span there is whatever the provider
  // SDK last opened — parent explicitly so the turn always hangs off the agent.
  turnSpans.set(turnId, agentSpan ? withActiveSpan(agentSpan, open) : open());
}

function endTurnSpan(observation: FlueObservation, turnSpans: Map<string, Span>, recordOutputs: boolean): void {
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

  const provider = observation.request?.providerId ?? observation.request?.providerName;
  if (provider) {
    span.setAttribute(GEN_AI_PROVIDER_NAME, provider);
  }

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
function setUsageAttributes(span: Span, usage: FlueUsage | undefined, isError?: boolean): void {
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
function startToolSpan(
  observation: FlueObservation,
  toolSpans: Map<string, Span>,
  agentSpan: Span | undefined,
  recordInputs: boolean,
): void {
  const { toolCallId, toolName } = observation;
  if (!toolCallId || toolSpans.has(toolCallId)) {
    return;
  }

  const open = (): Span =>
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
    });

  toolSpans.set(toolCallId, agentSpan ? withActiveSpan(agentSpan, open) : open());
}

function endToolSpan(observation: FlueObservation, toolSpans: Map<string, Span>, recordOutputs: boolean): void {
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
function recordRequestContent(observation: FlueObservation, turnSpans: Map<string, Span>): void {
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
