import type { Span, WrappedFunction } from '@sentry/core';
import {
  captureException,
  fill,
  getActiveSpan,
  getCurrentScope,
  getDefaultCurrentScope,
  getDefaultIsolationScope,
  getIsolationScope,
  getOriginalFunction,
  handleCallbackErrors,
  SPAN_STATUS_ERROR,
  startInactiveSpan,
  startNewTrace,
  startSpan,
  stringify,
  withActiveSpan,
  withScope,
} from '@sentry/core';
import {
  GEN_AI_CONVERSATION_ID,
  GEN_AI_OPERATION_NAME,
  GEN_AI_PROVIDER_NAME,
  GEN_AI_TOOL_CALL_ARGUMENTS,
  GEN_AI_TOOL_CALL_RESULT,
  GEN_AI_TOOL_DESCRIPTION,
  GEN_AI_TOOL_NAME,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { GEN_AI_EXECUTE_TOOL, GEN_AI_INVOKE_AGENT } from '@sentry/conventions/op';
import { GEN_AI_TOOL_CALL_ID_ATTRIBUTE } from '../core/gen-ai-attributes';
import { resolveAIRecordingOptions } from '../core/utils';
import { withCleanScopes } from '../../utils/withCleanScopes';
import { ANTHROPIC_AI_ORIGIN } from './constants';
import type { AnthropicAiOptions } from './types';

type AnyFunction = (...args: unknown[]) => unknown;
type RunnableTool = { name: string; description?: unknown };
type RunContext = { toolUse?: { id?: unknown }; toolUseBlock?: { id?: unknown }; signal?: AbortSignal } | undefined;
type ToolRunner = { params?: { tools?: unknown } };
type SessionToolRunner = { tools?: unknown; sessionId?: unknown };

/** Wrap the `toolRunner()` method of `owner` so the runners it returns trace their tool calls. */
export function instrumentToolRunnerFactory(
  owner: object,
  instrumentRunner: (runner: unknown, options: AnthropicAiOptions) => void,
  options: AnthropicAiOptions,
): void {
  wrapInPlace(owner, 'toolRunner', (toolRunner, thisArg, args) => {
    const runner = toolRunner.apply(thisArg, args);
    instrumentRunner(runner, options);
    return runner;
  });
}

/** Give each tool call of a tool runner a `gen_ai.execute_tool` span. */
export function instrumentToolRunner(runner: unknown, options: AnthropicAiOptions): void {
  if (!runner || typeof runner !== 'object') {
    return;
  }

  instrumentTools((runner as ToolRunner).params?.tools, options);

  // `addTools()` keeps its tools out of `params`.
  wrapInPlace(runner, 'addTools', (addTools, thisArg, tools) => {
    instrumentTools(tools, options);
    return addTools.apply(thisArg, tools);
  });
  wrapInPlace(runner, 'setMessagesParams', (setMessagesParams, thisArg, args) => {
    const result = setMessagesParams.apply(thisArg, args);
    instrumentTools((runner as ToolRunner).params?.tools, options);
    return result;
  });
}

/** Give each tool call of a Managed Agents session runner an `execute_tool` span, under one `invoke_agent` span per session. */
export function instrumentSessionToolRunner(runner: unknown, options: AnthropicAiOptions): void {
  if (!runner || typeof runner !== 'object') {
    return;
  }

  const { tools, sessionId } = runner as SessionToolRunner;
  // The session runner has no `addTools()`: it only runs the tools it was created with.
  instrumentTools(tools, options);
  wrapInPlace(runner, Symbol.asyncIterator, (iterate, thisArg) =>
    traceSessionLoop(
      iterate.call(thisArg) as AsyncIterator<unknown>,
      typeof sessionId === 'string' ? sessionId : undefined,
    ),
  );
}

/** Wraps the SDK's session iterator so the whole session runs inside one `invoke_agent` span. */
async function* traceSessionLoop(
  sdkIterator: AsyncIterator<unknown>,
  sessionId: string | undefined,
): AsyncGenerator<unknown> {
  const { span, firstResult } = startSession(sdkIterator, sessionId);

  try {
    let result = await firstResult;
    while (!result.done) {
      yield result.value;
      result = await sdkIterator.next();
    }
  } catch (error) {
    span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
    throw error;
  } finally {
    try {
      // After a `break`, closing the SDK loop waits for its in-flight tools, so the span ends after them.
      await sdkIterator.return?.();
    } finally {
      span.end();
    }
  }
}

// The SDK starts its tool loop on the first `next()`, so that call runs in the session and every tool inherits it.
function startSession(
  sdkIterator: AsyncIterator<unknown>,
  sessionId: string | undefined,
): { span: Span; firstResult: Promise<IteratorResult<unknown>> } {
  const start = (): { span: Span; firstResult: Promise<IteratorResult<unknown>> } =>
    withScope(scope => {
      // A tool shared between runners can't tell its session, so the id reaches its spans through the scope, unless
      // the app set one with `Sentry.setConversationId()`.
      if (sessionId && !scope.getScopeData().conversationId && !getIsolationScope().getScopeData().conversationId) {
        scope.setConversationId(sessionId);
      }

      const span = startInactiveSpan({
        name: 'invoke_agent',
        op: GEN_AI_INVOKE_AGENT,
        attributes: {
          [SENTRY_ORIGIN]: ANTHROPIC_AI_ORIGIN,
          [GEN_AI_OPERATION_NAME]: 'invoke_agent',
          [GEN_AI_PROVIDER_NAME]: 'anthropic',
          ...(sessionId ? { [GEN_AI_CONVERSATION_ID]: sessionId } : {}),
        },
      });
      // `async`, so a `next()` that throws rejects `firstResult` and still ends the span.
      return { span, firstResult: withActiveSpan(span, async () => sdkIterator.next()) };
    });

  // At top level all sessions would share the process's trace, so each gets its own; anywhere else it stays in the
  // caller's.
  return !getActiveSpan() && getCurrentScope() === getDefaultCurrentScope()
    ? withCleanScopes(getDefaultIsolationScope().clone(), () => startNewTrace(start))
    : start();
}

function instrumentTools(tools: unknown, options: AnthropicAiOptions): void {
  if (!Array.isArray(tools)) {
    return;
  }

  for (const tool of tools) {
    // Toolsets are nameless entries whose `run` takes `(ctx, toolUse)`, so only named tools are wrapped.
    if (tool && typeof tool === 'object' && typeof (tool as RunnableTool).name === 'string') {
      wrapInPlace(tool, 'run', (run, thisArg, args) => runWithSpan(tool as RunnableTool, run, thisArg, args, options));
    }
  }
}

function wrapInPlace(
  owner: object,
  key: string | symbol,
  call: (original: AnyFunction, thisArg: unknown, args: unknown[]) => unknown,
): void {
  const current = (owner as Record<string | symbol, unknown>)[key];
  if (typeof current === 'function' && !getOriginalFunction(current as WrappedFunction)) {
    fill(
      owner,
      key,
      (original: AnyFunction) =>
        function (this: unknown, ...args: unknown[]): unknown {
          return call(original, this, args);
        },
    );
  }
}

function runWithSpan(
  tool: RunnableTool,
  run: AnyFunction,
  thisArg: unknown,
  args: unknown[],
  options: AnthropicAiOptions,
): unknown {
  const { recordInputs, recordOutputs } = resolveAIRecordingOptions(options);
  const [input, context] = args as [unknown, RunContext];
  // SDK versions before `toolUse` existed pass only `toolUseBlock`.
  const callId = (context?.toolUse ?? context?.toolUseBlock)?.id;

  return startSpan(
    {
      name: `execute_tool ${tool.name}`,
      op: GEN_AI_EXECUTE_TOOL,
      attributes: {
        [SENTRY_ORIGIN]: ANTHROPIC_AI_ORIGIN,
        [GEN_AI_OPERATION_NAME]: 'execute_tool',
        [GEN_AI_TOOL_NAME]: tool.name,
        ...(typeof tool.description === 'string' ? { [GEN_AI_TOOL_DESCRIPTION]: tool.description } : {}),
        ...(typeof callId === 'string' ? { [GEN_AI_TOOL_CALL_ID_ATTRIBUTE]: callId } : {}),
        ...(recordInputs ? { [GEN_AI_TOOL_CALL_ARGUMENTS]: stringify(input) } : {}),
      },
    },
    span =>
      handleCallbackErrors(
        () => run.apply(thisArg, args),
        error => handleToolError(span, error, context),
        undefined,
        result => recordOutputs && span.setAttribute(GEN_AI_TOOL_CALL_RESULT, stringify(result)),
      ),
  );
}

function handleToolError(span: Span, error: unknown, context: RunContext): void {
  if (context?.signal?.aborted) {
    span.setStatus({ code: SPAN_STATUS_ERROR, message: 'cancelled' });
    return;
  }

  span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });

  // Only a runner passes `toolUse`/`toolUseBlock` (SDK 0.85+), and it hands the throw to the model as a result.
  // A direct call rethrows to its caller, and a `ToolError` is sent on purpose, so neither is captured.
  const fromRunner = !!(context?.toolUse ?? context?.toolUseBlock);
  if (fromRunner && (error as Error | undefined)?.name !== 'ToolError') {
    captureException(error, { mechanism: { handled: true, type: ANTHROPIC_AI_ORIGIN } });
  }
}
