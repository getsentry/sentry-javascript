import type { Span } from '@sentry/core';
import {
  captureException,
  isObjectLike,
  SPAN_STATUS_ERROR,
  startSpanManual,
  stringify,
  timestampInSeconds,
} from '@sentry/core';
import {
  GEN_AI_CONVERSATION_ID,
  GEN_AI_OPERATION_NAME,
  GEN_AI_TOOL_CALL_ARGUMENTS,
  GEN_AI_TOOL_CALL_RESULT,
  GEN_AI_TOOL_DESCRIPTION,
  GEN_AI_TOOL_NAME,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { GEN_AI_EXECUTE_TOOL } from '@sentry/conventions/op';
import { GEN_AI_TOOL_CALL_ID_ATTRIBUTE } from '../core/gen-ai-attributes';
import type { GenAiOptions } from '../core/utils';
import { resolveAIRecordingOptions } from '../core/utils';
import { piAiContentToString } from '../pi-ai/messages';
import { MAX_TRACKED_PI_RUNS, PI_DURABLE_ORIGIN, PI_TOOL_RESULT_ENTRY_KIND } from './constants';
import type { PiRuns, PiToolCall } from './runs';
import { toSentryConversationId } from './runs';
import type {
  PiAgent,
  PiCommitChange,
  PiEntryToken,
  PiTaskRuntime,
  PiTool,
  PiToolExecutionApi,
  PiToolResultMessage,
} from './types';
import { bound } from './utils';

/**
 * The tools pi-durable's `createBashTool`, `createReadTool`, `createEditTool` and `createWriteTool`
 * factories return. They throw to report expected failures to the model, such as a command that
 * exits non-zero, so their throws are not captured. Filled by the integration from the factories'
 * channels, which also covers the tools an app registers in an extension of its own.
 */
const BUILT_IN_TOOLS = new WeakSet<object>();

export function markBuiltInTool(tool: unknown): void {
  if (isObjectLike(tool)) {
    BUILT_IN_TOOLS.add(tool);
  }
}

/**
 * Prepare the runtime of a `pi.tool` phase. The tool task resolves the called tool from its agent,
 * so the runtime hands out traced tools, and it collects the result entries the phase commits.
 * `finish` ends the phase's tool spans with the result the model receives, which pi-durable builds
 * after `execute()` returns: from `api.output()`, through `afterTool` hooks and output limits.
 */
export function instrumentToolPhase(
  runtime: PiTaskRuntime,
  runs: PiRuns,
  wrapTool: (tool: PiTool) => PiTool,
): { runtime: PiTaskRuntime; finish: () => void } {
  const results = new Map<unknown, PiToolResultMessage>();
  runs.toolCalls.set(runtime.taskId, []);

  const agent = (context: unknown): Promise<PiAgent> =>
    runtime
      .agent(context)
      .then(resolved => (resolved?.tools ? { ...resolved, tools: resolved.tools.map(wrapTool) } : resolved));

  const commit = (change: PiCommitChange, context: unknown): Promise<void> => {
    let committed: PiToolResultMessage[] = [];
    const observedChange: PiCommitChange = (tx, current) => {
      // A commit can run its change again, so only the attempt that committed counts.
      committed = [];
      return change(observeToolResultEntries(tx, committed), current);
    };
    return runtime.commit(observedChange, context).then(() => {
      for (const message of committed) {
        results.set(message.toolCallId, message);
      }
    });
  };

  return {
    runtime: new Proxy(runtime, {
      get(target, property) {
        if (property === 'agent') {
          return agent;
        }
        return property === 'commit' ? commit : bound(target, property);
      },
    }),
    finish: () => {
      for (const call of runs.toolCalls.get(runtime.taskId) ?? []) {
        finishToolCall(call, call.callId !== undefined ? results.get(call.callId) : undefined);
      }
      runs.toolCalls.delete(runtime.taskId);
    },
  };
}

/** Wrap a tool so each call gets a `gen_ai.execute_tool` span. */
export function instrumentTool(tool: PiTool, runs: PiRuns, options: GenAiOptions): PiTool {
  const execute = (args: unknown, api: PiToolExecutionApi, context: unknown): Promise<unknown> => {
    const { recordInputs, recordOutputs } = resolveAIRecordingOptions(options);
    const phaseCalls = runs.toolCalls.get(api?.taskId);
    // A tool that runs another tool of its agent passes its own `api` on, so the inner call shares
    // the call id. Only the outer call gets the committed result; the inner one ends with its own.
    const calls = phaseCalls?.some(call => call.callId !== undefined && call.callId === api?.callId)
      ? undefined
      : phaseCalls;

    return startSpanManual(
      {
        name: `execute_tool ${tool.name}`,
        op: GEN_AI_EXECUTE_TOOL,
        attributes: {
          [SENTRY_ORIGIN]: PI_DURABLE_ORIGIN,
          [GEN_AI_OPERATION_NAME]: 'execute_tool',
          [GEN_AI_TOOL_NAME]: tool.name,
          ...(tool.description ? { [GEN_AI_TOOL_DESCRIPTION]: tool.description } : {}),
          ...(api?.callId ? { [GEN_AI_TOOL_CALL_ID_ATTRIBUTE]: api.callId } : {}),
          ...(api?.conversationId !== undefined
            ? { [GEN_AI_CONVERSATION_ID]: toSentryConversationId(runs, api.conversationId) }
            : {}),
          ...(recordInputs && args !== undefined ? { [GEN_AI_TOOL_CALL_ARGUMENTS]: stringify(args) } : {}),
        },
      },
      async span => {
        const call: PiToolCall = { span, callId: api?.callId, recordOutputs };
        calls?.push(call);
        try {
          const result = await tool.execute(args, trackOwnedConversations(api, span, runs), context);
          call.endTimestamp = timestampInSeconds();
          if (!calls) {
            // No result entry follows a call outside a tool task phase, nor a nested call.
            finishToolCall(call, { content: result?.content, isError: result?.isError });
          }
          return result;
        } catch (error) {
          call.endTimestamp = timestampInSeconds();
          call.failed = true;
          // pi-durable turns the throw into an error result for the model, so nothing propagates to
          // the global handlers. An aborted call is not a failure.
          if ((context as { abortSignal?: AbortSignal } | undefined)?.abortSignal?.aborted) {
            span.setStatus({ code: SPAN_STATUS_ERROR, message: 'cancelled' });
          } else {
            span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
            if (!BUILT_IN_TOOLS.has(tool)) {
              captureException(error, { mechanism: { handled: true, type: PI_DURABLE_ORIGIN } });
            }
          }
          if (!calls) {
            span.end(call.endTimestamp);
          }
          throw error;
        }
      },
    );
  };

  // The proxy's target is an empty object with the tool as prototype, not the tool itself, so a
  // frozen tool does not break the proxy invariants. Members are read bound to the tool, so a
  // method that reads a private field works.
  return new Proxy(Object.create(tool) as PiTool, {
    get(_target, property) {
      return property === 'execute' ? execute : bound(tool, property);
    },
  });
}

function finishToolCall(call: PiToolCall, message: PiToolResultMessage | undefined): void {
  if (message) {
    const result = call.recordOutputs ? piAiContentToString(message.content) : undefined;
    if (result !== undefined) {
      call.span.setAttribute(GEN_AI_TOOL_CALL_RESULT, result);
    }
    if (message.isError && !call.failed) {
      call.span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
    }
  }
  call.span.end(call.endTimestamp);
}

function observeToolResultEntries(tx: object, committed: PiToolResultMessage[]): object {
  return new Proxy(tx, {
    get(target, property) {
      const value = bound(target, property);
      if (property !== 'appendEntry' || typeof value !== 'function') {
        return value;
      }
      return (
        token: PiEntryToken,
        conversationId: unknown,
        draft: { model?: unknown[] } | undefined,
        ...rest: unknown[]
      ) => {
        const message = token?.kind === PI_TOOL_RESULT_ENTRY_KIND ? draft?.model?.[0] : undefined;
        if (isObjectLike(message)) {
          committed.push(message);
        }
        return value(token, conversationId, draft, ...rest);
      };
    },
  });
}

/**
 * Record the conversations a tool call creates for itself, the subagent pattern: `api.commit()` with
 * `tx.createConversation()` or `tx.forkConversation()` and `ownership: { kind: 'task', taskId: api.taskId }`.
 */
function trackOwnedConversations(api: PiToolExecutionApi, span: Span, runs: PiRuns): PiToolExecutionApi {
  if (typeof api?.commit !== 'function') {
    return api;
  }
  const commit = api.commit.bind(api);

  const trackCreatedConversations = (tx: object): object =>
    new Proxy(tx, {
      get(target, property) {
        const value = bound(target, property);
        if ((property !== 'createConversation' && property !== 'forkConversation') || typeof value !== 'function') {
          return value;
        }
        return async (...args: unknown[]) => {
          const record = (await value(...args)) as { id?: unknown } | undefined;
          const ownership = args.find(
            (arg): arg is { ownership: { kind?: string } } => isObjectLike(arg) && isObjectLike(arg.ownership),
          )?.ownership;
          if (ownership?.kind === 'task' && record?.id !== undefined) {
            if (runs.owners.size >= MAX_TRACKED_PI_RUNS) {
              runs.owners.delete(runs.owners.keys().next().value);
            }
            runs.owners.set(record.id, span);
          }
          return record;
        };
      },
    });

  return new Proxy(api, {
    get(target, property) {
      if (property !== 'commit') {
        return bound(target, property);
      }
      return (change: (tx: object) => unknown, context: unknown) =>
        commit((tx: object) => change(trackCreatedConversations(tx)), context);
    },
  });
}
