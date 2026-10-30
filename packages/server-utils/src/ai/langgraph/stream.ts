import { getCurrentScope, SPAN_STATUS_ERROR, startSpanManual } from '@sentry/core';
import { GEN_AI_RESPONSE_STREAMING } from '@sentry/conventions/attributes';
import type { BaseChatModel, LangChainMessage } from '../langchain/types';
import { _INTERNAL_addLangChainCallbackHandler } from '../langchain/utils';
import { getAgentSpanOptions, getInvokeMarker, LANGGRAPH_INVOKE_ACTIVE, prepareAgentSpan } from './agent-span';
import type { CompiledGraph, LangGraphOptions } from './types';
import { setResponseAttributes } from './utils';

/**
 * Instruments CompiledGraph's stream method with a `gen_ai.invoke_agent` span that lasts for the graph run.
 *
 * LangGraph runs the graph as soon as `stream()` is called, whether or not the stream is read, so the span
 * ends on the run's own end or error callback rather than when the stream is consumed.
 */
export function instrumentCompiledGraphStream(
  originalStream: (...args: unknown[]) => Promise<unknown>,
  graphInstance: CompiledGraph,
  compileOptions: Record<string, unknown>,
  options: LangGraphOptions,
  llm?: BaseChatModel | null,
  sentryCallbackHandler?: unknown,
): (...args: unknown[]) => Promise<unknown> {
  const invokeMarker = getInvokeMarker(graphInstance);

  return new Proxy(originalStream, {
    apply(target, thisArg, args: unknown[]): Promise<unknown> {
      const scope = getCurrentScope();
      if (scope.getScopeData().sdkProcessingMetadata[LANGGRAPH_INVOKE_ACTIVE] === invokeMarker) {
        scope.setSDKProcessingMetadata({ [LANGGRAPH_INVOKE_ACTIVE]: undefined });
        return Reflect.apply(target, thisArg, args);
      }

      return startSpanManual(getAgentSpanOptions(args, { [GEN_AI_RESPONSE_STREAMING]: true }), async span => {
        let inputMessages: LangChainMessage[] | null = null;
        let stream: { signal?: AbortSignal } | undefined;
        let ended = false;
        const finish = (outcome?: { outputs: unknown } | { error: unknown }): void => {
          if (ended) {
            return;
          }
          ended = true;
          try {
            if (outcome && 'error' in outcome) {
              // A cancel or abort by the caller is not a failed run. LangGraph reports both, and step
              // timeouts too, as `Error('Abort')`, so only the signals tell them apart.
              if (!stream?.signal?.aborted && !(args[1] as { signal?: AbortSignal } | undefined)?.signal?.aborted) {
                span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
              }
            } else if (outcome && options.recordOutputs) {
              setResponseAttributes(span, inputMessages, outcome.outputs);
            }
          } catch {
            // Recording must never change the outcome of the run.
          }
          span.end();
          inputMessages = null;
        };

        // The root run starts before any of its children, so it is the first run this per-call listener sees.
        let rootRunId: string | undefined;
        const listener = {
          name: 'SentryLangGraphStreamListener',
          awaitHandlers: true,
          handleChainStart(_chain: unknown, _inputs: unknown, runId: string): void {
            rootRunId ??= runId;
          },
          handleChainEnd(outputs: unknown, runId: string): void {
            if (runId === rootRunId) {
              finish({ outputs });
            }
          },
          handleChainError(error: unknown, runId: string): void {
            if (runId === rootRunId) {
              finish({ error });
            }
          },
          copy() {
            return listener;
          },
        };

        try {
          inputMessages = prepareAgentSpan(
            span,
            args,
            graphInstance,
            compileOptions,
            options,
            llm,
            sentryCallbackHandler,
          );
          // `prepareAgentSpan` gave the call its own copy of the config, so the listener stays on this call.
          const config = args[1] as Record<string, unknown>;
          config.callbacks = _INTERNAL_addLangChainCallbackHandler(config.callbacks, listener);
          stream = (await Reflect.apply(target, thisArg, args)) as typeof stream;
        } catch (error) {
          finish({ error });
          throw error;
        }

        if (rootRunId === undefined) {
          // Not a LangGraph run we can follow, so don't leave the span open.
          finish();
        } else {
          endOnEarlyExit(stream, finish);
        }
        return stream;
      });
    },
  });
}

// After a `break`, LangGraph keeps running the graph but never reports the run's end, so the span ends when
// the caller stops. Nodes still running at that point start spans after the agent span ended.
function endOnEarlyExit(stream: unknown, finish: () => void): void {
  if (!stream || typeof stream !== 'object') {
    return;
  }
  const target = stream as { return?: (...args: unknown[]) => unknown; cancel?: (...args: unknown[]) => unknown };
  const { return: originalReturn, cancel: originalCancel } = target;
  try {
    if (typeof originalReturn === 'function') {
      target.return = function (this: unknown, ...args: unknown[]): unknown {
        try {
          return originalReturn.apply(this, args);
        } finally {
          finish();
        }
      };
    }
    if (typeof originalCancel === 'function') {
      target.cancel = function (this: unknown, ...args: unknown[]): unknown {
        const result = originalCancel.apply(this, args);
        Promise.resolve(result).then(
          () => finish(),
          () => undefined,
        );
        return result;
      };
    }
  } catch {
    finish();
  }
}
