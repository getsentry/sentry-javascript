import type { Scope, Span, SpanStatus } from '@sentry/core';
import {
  debug,
  getDefaultIsolationScope,
  SPAN_STATUS_ERROR,
  startInactiveSpan,
  startNewTrace,
  uuid4,
} from '@sentry/core';
import { GEN_AI_CONVERSATION_ID, GEN_AI_OPERATION_NAME, SENTRY_ORIGIN } from '@sentry/conventions/attributes';
import { DEBUG_BUILD } from '../../debug-build';
import { getGenAiSpanOp } from '../core/utils';
import { MAX_TRACKED_PI_RUNS, PI_DURABLE_ORIGIN, PI_LIVE_DOC_KIND } from './constants';
import type { PiCommitChange, PiDocToken, PiLiveState, PiSettlement, PiTaskRuntime } from './types';
import { bound, withCleanScopes } from './utils';

// Unanswered reasons that mean the run was stopped, not that it failed.
const CANCELLED_REASONS = new Set(['aborted', 'reset']);

/**
 * One run: the work from an input to its answer. It spans several `pi.generation` tasks (run control
 * moves to a new one after every tool round) and their `pi.tool` tasks, so it is tracked per
 * conversation, which runs at most one run at a time.
 */
export interface PiRun {
  conversationId: unknown;
  span: Span;
  isolationScope: Scope;
  /** The run's first input submission, which identifies the run in `pi.live`. */
  firstInput?: unknown;
  /**
   * The status the run ends with, set while the commit that ends it is in flight. `harness.close()`
   * can begin in that gap, because `wait()` resolves as soon as the commit settles the inputs.
   */
  pendingEnd?: { status?: SpanStatus };
}

/** Open runs of one Harness, keyed by the pi-durable conversation id. */
export interface PiRuns {
  /**
   * Random id of this Harness, prefixed to `gen_ai.conversation.id`. pi-durable numbers
   * conversations per storage from 1, so the bare id would merge the root conversations of every
   * Harness into one Sentry conversation.
   */
  harnessId: string;
  active: Map<unknown, PiRun>;
  /**
   * `execute_tool` spans of tool calls that created a conversation they own, keyed by that
   * conversation. The child's first run becomes a child of the call, which is how a subagent's run
   * joins the trace of the run that delegated to it.
   */
  owners: Map<unknown, Span>;
  /**
   * Tool calls of running `pi.tool` phases, keyed by task id. Their spans end when the phase ends,
   * after it has committed the result the model receives.
   */
  toolCalls: Map<unknown, PiToolCall[]>;
}

/** One `execute()` of a tool. */
export interface PiToolCall {
  span: Span;
  callId?: string;
  recordOutputs: boolean;
  /** Set once the span has a status other than ok, so the committed result does not overwrite it. */
  failed?: boolean;
  /** When `execute()` settled, used as the span's end time. */
  endTimestamp?: number;
}

export function createRuns(): PiRuns {
  return {
    harnessId: uuid4(),
    active: new Map(),
    owners: new Map(),
    toolCalls: new Map(),
  };
}

export function toSentryConversationId(runs: PiRuns, conversationId: unknown): string {
  return `${runs.harnessId}:${String(conversationId)}`;
}

/** Start a run of `conversationId`: a new trace, or a child of the tool call that owns the conversation. */
export function startRun(conversationId: unknown, runs: PiRuns): PiRun {
  if (runs.active.size >= MAX_TRACKED_PI_RUNS) {
    const oldest = runs.active.keys().next().value;
    runs.active.get(oldest)?.span.end();
    runs.active.delete(oldest);
  }

  const owner = runs.owners.get(conversationId);
  runs.owners.delete(conversationId);

  const isolationScope = getDefaultIsolationScope().clone();
  const startRunSpan = (): Span =>
    startInactiveSpan({
      name: 'invoke_agent',
      op: getGenAiSpanOp('invoke_agent'),
      ...(owner ? { parentSpan: owner } : {}),
      attributes: {
        [SENTRY_ORIGIN]: PI_DURABLE_ORIGIN,
        [GEN_AI_OPERATION_NAME]: 'invoke_agent',
        [GEN_AI_CONVERSATION_ID]: toSentryConversationId(runs, conversationId),
      },
    });
  const span = withCleanScopes(isolationScope, () => (owner ? startRunSpan() : startNewTrace(startRunSpan)));

  const run: PiRun = { conversationId, span, isolationScope };
  runs.active.set(conversationId, run);
  DEBUG_BUILD && debug.log(`[pi-durable] run of conversation ${String(conversationId)} started`);
  return run;
}

export function endRun(run: PiRun, runs: PiRuns, status?: SpanStatus): void {
  if (runs.active.get(run.conversationId) !== run) {
    return;
  }
  runs.active.delete(run.conversationId);
  DEBUG_BUILD && debug.log(`[pi-durable] run of conversation ${String(run.conversationId)} ended`, status ?? 'ok');
  if (status) {
    run.span.setStatus(status);
  }
  run.span.end();
}

/**
 * Watch the generation task's commits for the end of its run.
 *
 * pi-durable keeps run control in the conversation's `pi.live` document: `run` names the task that
 * owns the run and the run's inputs, it moves to the next generation after every tool round, and it
 * is removed, in the same commit that settles the inputs, when the run ends. Every commit that moves
 * or ends a run edits `pi.live` through `tx.doc()`, so reading that draft after the commit's change
 * function returns shows whether the run survived the commit.
 */
export function observeRunControl(runtime: PiTaskRuntime, run: PiRun, runs: PiRuns): PiTaskRuntime {
  const commit = (change: PiCommitChange, context: unknown): Promise<void> => {
    let ended = false;
    let settlement: PiSettlement | undefined;

    const observedChange: PiCommitChange = async (tx, current) => {
      // A commit can run its change again, so only the attempt that committed counts.
      ended = false;
      settlement = undefined;
      let live: Promise<unknown> | undefined;
      const observedTx = new Proxy(tx, {
        get(target, property) {
          const value = bound(target, property);
          if (typeof value !== 'function') {
            return value;
          }
          if (property === 'doc') {
            return (token: PiDocToken, id: unknown, ...rest: unknown[]) => {
              const draft = value(token, id, ...rest);
              if (token?.definition?.kind === PI_LIVE_DOC_KIND && id === run.conversationId) {
                live = Promise.resolve(draft);
              }
              return draft;
            };
          }
          if (property === 'settleSubmission') {
            return (id: unknown, submissionSettlement: PiSettlement, ...rest: unknown[]) => {
              if (run.firstInput === undefined || id === run.firstInput) {
                settlement = submissionSettlement;
              }
              return value(id, submissionSettlement, ...rest);
            };
          }
          return value;
        },
      });

      const result = await change(observedTx, current);
      const draft = (await live) as PiLiveState | undefined;
      if (draft) {
        const firstInput = draft.run?.inputs?.[0];
        if (firstInput === undefined) {
          ended = true;
        } else if (run.firstInput === undefined) {
          run.firstInput = firstInput;
        } else if (firstInput !== run.firstInput) {
          // The run ended and a queued input started the next one in the same commit.
          ended = true;
        }
      }
      run.pendingEnd = ended ? { status: toRunStatus(settlement) } : undefined;
      return result;
    };

    return runtime.commit(observedChange, context).then(
      () => {
        if (ended) {
          endRun(run, runs, toRunStatus(settlement));
        }
      },
      error => {
        run.pendingEnd = undefined;
        throw error;
      },
    );
  };

  return new Proxy(runtime, {
    get(target, property) {
      return property === 'commit' ? commit : bound(target, property);
    },
  });
}

function toRunStatus(settlement: PiSettlement | undefined): SpanStatus | undefined {
  if (settlement?.status !== 'unanswered') {
    return undefined;
  }
  const reason = settlement.reason ?? 'internal_error';
  return { code: SPAN_STATUS_ERROR, message: CANCELLED_REASONS.has(reason) ? 'cancelled' : reason };
}
