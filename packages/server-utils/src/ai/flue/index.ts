import type { Scope, Span } from '@sentry/core';
import {
  consoleSandbox,
  continueTrace,
  getActiveSpan,
  getDefaultIsolationScope,
  getIsolationScope,
  GLOBAL_OBJ,
  LRUMap,
  startNewTrace,
  startSpan,
  withActiveSpan,
  withScope,
} from '@sentry/core';
import {
  GEN_AI_AGENT_NAME,
  GEN_AI_CONVERSATION_ID,
  GEN_AI_OPERATION_NAME,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import type { GenAiOptions } from '../core/utils';
import { getGenAiSpanOp, resolveAIRecordingOptions } from '../core/utils';
import { getOrchestrionInjectedModules } from '../../orchestrion/detect';
import { piAiModuleNames } from '../../orchestrion/config/pi-ai';
import { withCleanScopes } from '../../utils/withCleanScopes';
import { FLUE_INSTRUMENTATION_KEY, FLUE_OPERATION, FLUE_ORIGIN, MAX_TRACKED_FLUE_SPANS } from './constants';
import type { SpanTracker } from './utils';
import { endToolSpan, sentryTraceFromTraceparent, startToolSpan } from './utils';
import type { FlueInstrumentation } from './types';

export type FlueOptions = GenAiOptions;

interface Admission {
  isolationScope: Scope;
  span: Span | undefined;
}

let checkedPiAiInstrumentation = false;

/**
 * Flue's model calls are traced by the pi-ai integration, which needs Sentry's module hook or bundler
 * plugin, while `instrument()` works without either. Checked on the first model call, by which point
 * pi-ai has loaded and is listed if it was instrumented.
 */
function warnIfPiAiNotInstrumented(): void {
  if (checkedPiAiInstrumentation) {
    return;
  }
  checkedPiAiInstrumentation = true;

  const injected = getOrchestrionInjectedModules();
  if (piAiModuleNames.some(name => injected.includes(name))) {
    return;
  }

  consoleSandbox(() => {
    // eslint-disable-next-line no-console
    console.warn(
      '[Sentry] Flue model calls are not being traced: `@earendil-works/pi-ai` was not instrumented, so ' +
        'Flue agents record agent and tool spans but no `gen_ai.chat` spans. Model calls are traced by the ' +
        "pi-ai integration, which needs Sentry's module hook or bundler plugin. On Node, load Sentry with " +
        '`--import` (for example `node --import ./instrument.mjs app.mjs`). On Cloudflare, add ' +
        '`sentryCloudflareVitePlugin()`. On Bun, build with `@sentry/bun/plugin`.',
    );
  });
}

/**
 * Flue's Node coordinator runs every submission from one long-lived claim loop, started by the
 * first admission and keeping that call's async context for the life of the process. Left alone,
 * every agent run lands in the trace of whichever request admitted the first one
 * (https://github.com/withastro/flue/issues/813).
 */
function runInAdmissionContext<T>(admission: Admission | undefined, next: () => T): T {
  if (isCloudflareWorkers()) {
    return next();
  }
  if (!admission) {
    // Admitted by another process, replayed by idempotency key, or evicted: there is nothing to
    // restore, but the loop's context still belongs to an unrelated request.
    return withCleanScopes(getDefaultIsolationScope().clone(), () => startNewTrace(next));
  }
  return withCleanScopes(admission.isolationScope, () =>
    admission.span ? withActiveSpan(admission.span, next) : startNewTrace(next),
  );
}

/**
 * Cloudflare runs each turn from a Durable Object alarm, which already starts a trace of its own, so
 * there is no leaked context to undo there.
 */
function isCloudflareWorkers(): boolean {
  return GLOBAL_OBJ.navigator?.userAgent === 'Cloudflare-Workers';
}

/**
 * Build the object to hand to `instrument()` from `@flue/runtime`.
 *
 * The two callbacks own different halves of the result:
 *
 * - `interceptor` wraps agent execution, so the agent span is *active* for its duration and every
 *   span opened underneath parents correctly.
 * - `observe` opens and closes the tool spans, and names the agent span.
 *
 * Model calls get no span here: Flue sends them through pi-ai, whose integration reports each one
 * as a `gen_ai.chat` span under the agent span.
 *
 * Message content, tool arguments and tool results are gated on `recordInputs`/`recordOutputs`,
 * which fall back to the current client's `dataCollection.genAI` settings and are read per event.
 */
export function createFlueInstrumentation(options: FlueOptions = {}): FlueInstrumentation {
  // Keyed by the agent operation's own id, which is what the observations carry. That keeps
  // concurrent runs apart and gives a delegated subagent its own span: Flue nests a second `agent`
  // operation inside the parent's for `task` delegation, and the nesting is not bounded at two.
  // A plain map: the entry is removed in a `finally`, so it is bounded by concurrent agent runs.
  const agentSpans = new Map<string, Span>();
  // Capped, unlike the above: these are keyed off ids that only a matching end observation removes.
  const toolSpans: SpanTracker = new LRUMap(MAX_TRACKED_FLUE_SPANS);
  // Capped: a submission admitted here but run by another process never settles here.
  const admissions = new LRUMap<string, Admission>(MAX_TRACKED_FLUE_SPANS);

  return {
    key: FLUE_INSTRUMENTATION_KEY,

    interceptor: async (operation, ctx, next) => {
      // `observe` has already opened the span for this unit of work; make it active for the
      // duration so whatever the tool or model call does lands inside it rather than beside it.
      if (operation?.type === FLUE_OPERATION.TOOL) {
        const toolSpan = operation.toolCallId ? toolSpans.get(operation.toolCallId) : undefined;
        return toolSpan ? withActiveSpan(toolSpan, next) : next();
      }
      // The `gen_ai.chat` span of the model call comes from the pi-ai integration, which reads the
      // conversation from the scope.
      if (operation?.type === FLUE_OPERATION.MODEL) {
        warnIfPiAiNotInstrumented();
        const { conversationId } = ctx;
        return conversationId
          ? withScope(scope => {
              scope.setConversationId(conversationId);
              return next();
            })
          : next();
      }

      if (operation?.type !== FLUE_OPERATION.AGENT) {
        return next();
      }

      // A submission opens with a wrapper operation whose id *is* the submission id; the run it
      // wraps gets its own operation id, and that is the one the observations reference. Spanning
      // the wrapper too would double-count every agent invocation, but it is the outermost point of
      // every attempt, so it is where the admitting context goes back in.
      const operationId = operation.operationId;
      if (operationId && operationId === ctx.submissionId) {
        return runInAdmissionContext(admissions.get(operationId), next);
      }
      if (!operationId || agentSpans.has(operationId)) {
        return next();
      }

      const openAgentSpan = () =>
        startSpan(
          {
            name: `invoke_agent ${ctx.agentName ?? 'agent'}`,
            op: getGenAiSpanOp('invoke_agent'),
            attributes: {
              [SENTRY_ORIGIN]: FLUE_ORIGIN,
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
      // Resolved per observation, not once at construction: `resolveAIRecordingOptions` reads the
      // current client's `dataCollection.genAI`, and Cloudflare replaces the client per request, so
      // values captured at isolate load would be the wrong ones for every later request.
      const { recordInputs, recordOutputs } = resolveAIRecordingOptions(options);

      // Observations are emitted synchronously from inside the agent operation, so the active span
      // here is the agent span the interceptor opened — tool spans parent off it without any
      // bookkeeping.
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
        // Emitted synchronously from inside the admitting call, so the active context is its own.
        case 'submission_queued':
          if (observation.submissionId && !isCloudflareWorkers()) {
            admissions.set(observation.submissionId, {
              isolationScope: getIsolationScope(),
              span: getActiveSpan(),
            });
          }
          return;
        case 'submission_settled':
          if (observation.submissionId) {
            admissions.remove(observation.submissionId);
          }
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

    // Only the tool spans are ended here. They come from `startInactiveSpan`, so nothing else will.
    // The agent spans come from `startSpan`, which ends them when its callback settles — ending them
    // here would stamp an early end time on work that is still running, and the later `end()` would
    // be ignored.
    dispose: () => {
      for (const span of toolSpans.values()) {
        span.end();
      }
      agentSpans.clear();
      admissions.clear();
      toolSpans.clear();
    },
  };
}
