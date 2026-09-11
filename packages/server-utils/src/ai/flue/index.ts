import type { Span } from '@sentry/core';
import {
  _INTERNAL_shouldSkipAiProviderWrapping,
  _INTERNAL_skipAiProviderWrapping,
  continueTrace,
  getActiveSpan,
  LRUMap,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  startSpan,
  withActiveSpan,
} from '@sentry/core';
import { GEN_AI_AGENT_NAME, GEN_AI_CONVERSATION_ID, GEN_AI_OPERATION_NAME } from '@sentry/conventions/attributes';
import { ANTHROPIC_AI_INTEGRATION_NAME } from '../anthropic-ai/constants';
import type { GenAiOptions } from '../core/utils';
import { getGenAiSpanOp, resolveAIRecordingOptions } from '../core/utils';
import { GOOGLE_GENAI_INTEGRATION_NAME } from '../google-genai/constants';
import { OPENAI_INTEGRATION_NAME } from '../openai/constants';
import { FLUE_INSTRUMENTATION_KEY, FLUE_OPERATION, FLUE_ORIGIN, MAX_TRACKED_FLUE_SPANS } from './constants';
import type { SpanTracker } from './utils';
import {
  endToolSpan,
  endTurnSpan,
  recordRequestContent,
  sentryTraceFromTraceparent,
  startToolSpan,
  startTurnSpan,
} from './utils';
import type { FlueInstrumentation } from './types';

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
 * which fall back to the current client's `dataCollection.genAI` settings and are read per event.
 */
export function createFlueInstrumentation(options: FlueOptions = {}): FlueInstrumentation {
  // Flue drives the providers through `@earendil-works/pi-ai`, which bundles the `openai`,
  // `@anthropic-ai/sdk` and `@google/genai` clients. Left alone they instrument the same call this
  // reports as a turn, emitting a second `gen_ai.chat` beside ours.
  //
  // Applied on first use rather than here, for two reasons. Constructing the object proves nothing
  // — if `instrument()` rejects it, suppressing the provider integrations would leave the app with
  // no `gen_ai.chat` spans at all. And the registry is reset per client (`_setupIntegrations`
  // clears it, and Cloudflare calls `init()` per request), so a one-shot call at module scope is
  // wiped by the next `init()` and every later request double-reports.
  const skipProviders = (): void => {
    if (!SKIPPED_PROVIDERS.every(provider => _INTERNAL_shouldSkipAiProviderWrapping(provider))) {
      _INTERNAL_skipAiProviderWrapping(SKIPPED_PROVIDERS);
    }
  };

  // Keyed by the agent operation's own id, which is what the observations carry. That keeps
  // concurrent runs apart and gives a delegated subagent its own span: Flue nests a second `agent`
  // operation inside the parent's for `task` delegation, and the nesting is not bounded at two.
  // A plain map: the entry is removed in a `finally`, so it is bounded by concurrent agent runs.
  const agentSpans = new Map<string, Span>();
  // Capped, unlike the above: these are keyed off ids that only a matching end observation removes.
  const turnSpans: SpanTracker = new LRUMap(MAX_TRACKED_FLUE_SPANS);
  const toolSpans: SpanTracker = new LRUMap(MAX_TRACKED_FLUE_SPANS);

  return {
    key: FLUE_INSTRUMENTATION_KEY,

    interceptor: async (operation, ctx, next) => {
      skipProviders();

      // `observe` has already opened the span for this unit of work; make it active for the
      // duration so whatever the tool or model call does lands inside it rather than beside it.
      if (operation?.type === FLUE_OPERATION.TOOL) {
        const toolSpan = operation.toolCallId ? toolSpans.get(operation.toolCallId) : undefined;
        return toolSpan ? withActiveSpan(toolSpan, next) : next();
      }
      if (operation?.type === FLUE_OPERATION.MODEL) {
        const turnSpan = operation.turnId ? turnSpans.get(operation.turnId) : undefined;
        return turnSpan ? withActiveSpan(turnSpan, next) : next();
      }

      if (operation?.type !== FLUE_OPERATION.AGENT) {
        return next();
      }

      // A submission opens with a wrapper operation whose id *is* the submission id; the run it
      // wraps gets its own operation id, and that is the one the observations reference. Spanning
      // the wrapper too would double-count every agent invocation.
      const operationId = operation.operationId;
      if (!operationId || operationId === ctx.submissionId || agentSpans.has(operationId)) {
        return next();
      }

      const openAgentSpan = () =>
        startSpan(
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
          async (span: Span) => {
            agentSpans.set(operationId, span);
            try {
              return await next();
            } finally {
              agentSpans.delete(operationId);
            }
          },
        );

      // A durable or dispatched submission is run later by the coordinator, possibly in another
      // isolate or process, where nothing links it back to the request that enqueued it. Flue
      // replays that request's `traceparent` here, so continue from it — but only when no trace is
      // already active, so an in-process dispatch keeps the trace it is genuinely part of.
      const sentryTrace = ctx.traceCarrier?.traceparent
        ? sentryTraceFromTraceparent(ctx.traceCarrier.traceparent)
        : undefined;

      return sentryTrace && !getActiveSpan()
        ? continueTrace({ sentryTrace, baggage: undefined }, openAgentSpan)
        : openAgentSpan();
    },

    observe: observation => {
      skipProviders();

      // Resolved per observation, not once at construction: `resolveAIRecordingOptions` reads the
      // current client's `dataCollection.genAI`, and Cloudflare replaces the client per request, so
      // values captured at isolate load would be the wrong ones for every later request.
      const { recordInputs, recordOutputs } = resolveAIRecordingOptions(options);

      // Observations are emitted synchronously from inside the agent operation, so the active span
      // here is the agent span the interceptor opened — turn and tool spans parent off it without
      // any bookkeeping.
      //
      // The agent operation that gets the span is the one the observations reference, and it knows
      // neither the agent's name nor the conversation: the submission wrapper carries the name, the
      // re-entry carries the conversation, and neither opens a span. Both arrive here instead.
      const agentSpan = observation.operationId ? agentSpans.get(observation.operationId) : undefined;
      if (agentSpan) {
        if (observation.conversationId) {
          agentSpan.setAttribute(GEN_AI_CONVERSATION_ID, observation.conversationId);
        }
        if (observation.agentName) {
          agentSpan.setAttribute(GEN_AI_AGENT_NAME, observation.agentName);
          agentSpan.updateName(`invoke_agent ${observation.agentName}`);
        }
      }

      switch (observation.type) {
        case 'turn_start':
          startTurnSpan(observation, turnSpans);
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
          startToolSpan(observation, toolSpans, recordInputs);
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
      agentSpans.clear();
      turnSpans.clear();
      toolSpans.clear();
    },
  };
}
