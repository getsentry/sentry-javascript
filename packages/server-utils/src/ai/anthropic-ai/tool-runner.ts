import type { Scope, Span, WrappedFunction } from '@sentry/core';
import {
  captureException,
  debug,
  getActiveSpan,
  getCurrentScope,
  getDefaultCurrentScope,
  getDefaultIsolationScope,
  getIsolationScope,
  getOriginalFunction,
  handleCallbackErrors,
  markFunctionWrapped,
  SPAN_STATUS_ERROR,
  startInactiveSpan,
  startNewTrace,
  startSpan,
  stringify,
  withActiveSpan,
  withIsolationScope,
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
import { DEBUG_BUILD } from '../../debug-build';
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

/**
 * Give each tool call of a Managed Agents session runner a `gen_ai.execute_tool` span, and the session one
 * `gen_ai.invoke_agent` span over them, in a trace of its own when the runner is driven outside any request.
 */
export function instrumentSessionToolRunner(runner: unknown, options: AnthropicAiOptions): void {
  if (!runner || typeof runner !== 'object') {
    return;
  }

  // The session runner has no `addTools()`: it only runs the tools it was created with.
  instrumentTools((runner as SessionToolRunner).tools, options);
  // Nothing ties a tool call back to its session, so the tool spans are grouped under one span per runner.
  wrapInPlace(runner, Symbol.asyncIterator, (iterate, thisArg) =>
    traceSessionLoop(iterate.call(thisArg) as AsyncIterator<unknown>, (runner as SessionToolRunner).sessionId),
  );
}

// Lets a runner tell that a worker loop drives it, which the runner can't see from its own arguments.
const workerLoopScopes = new WeakSet<Scope>();

/**
 * Run each `run()` loop of an `EnvironmentWorker` apart from the code that started it, and mark it, so the sessions it
 * drives each get a trace and scope of their own.
 */
export function instrumentEnvironmentWorker(worker: unknown): void {
  if (!worker || typeof worker !== 'object') {
    return;
  }

  wrapInPlace(worker, 'run', (run, thisArg, args) => {
    const loopScope = getDefaultIsolationScope().clone();
    workerLoopScopes.add(loopScope);
    return inNewTrace(loopScope, () => run.apply(thisArg, args));
  });
}

// Like a queue consumer does for each job: clean scopes, so nothing carries over from the code around it.
function inNewTrace<T>(isolationScope: Scope, callback: () => T): T {
  return withCleanScopes(isolationScope, () => startNewTrace(callback));
}

/** Wraps the SDK's session iterator so the whole session runs inside one `invoke_agent` span. */
async function* traceSessionLoop(sdkIterator: AsyncIterator<unknown>, sessionId: unknown): AsyncGenerator<unknown> {
  const { span, runInSession } = startSessionSpan(sessionId);

  try {
    // `yield*` passes a `break` on to the SDK, so the span ends only after the SDK has drained its in-flight tools.
    return yield* runEachCallInSession(sdkIterator, runInSession);
  } catch (error) {
    span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
    throw error;
  } finally {
    span.end();
  }
}

// The SDK starts its tool loop on the first `next()` and drains it on `return()`, so both must run in the session.
function runEachCallInSession(
  sdkIterator: AsyncIterator<unknown>,
  runInSession: <T>(callback: () => T) => T,
): AsyncIterable<unknown> {
  return {
    [Symbol.asyncIterator]: () => ({
      next: (...args: [] | [unknown]) => runInSession(() => sdkIterator.next(...args)),
      return: sdkIterator.return && ((value?: unknown) => runInSession(() => sdkIterator.return!(value))),
      throw: sdkIterator.throw && ((error?: unknown) => runInSession(() => sdkIterator.throw!(error))),
    }),
  };
}

/** Starts the span of a session, and returns how to run code inside the session: under the span, in its scopes. */
function startSessionSpan(sessionId: unknown): { span: Span; runInSession: <T>(callback: () => T) => T } {
  // Like a queue consumer's jobs, sessions driven by a worker loop or from top-level code get their own trace and
  // scope; anywhere else they stay in the caller's.
  const ownTrace =
    workerLoopScopes.has(getIsolationScope()) || (!getActiveSpan() && getCurrentScope() === getDefaultCurrentScope());
  const inSessionScopes = <T>(callback: () => T): T =>
    ownTrace ? inNewTrace(getDefaultIsolationScope().clone(), callback) : callback();

  return inSessionScopes(() => {
    const span = startInactiveSpan({
      name: 'invoke_agent',
      op: GEN_AI_INVOKE_AGENT,
      attributes: {
        [SENTRY_ORIGIN]: ANTHROPIC_AI_ORIGIN,
        [GEN_AI_OPERATION_NAME]: 'invoke_agent',
        [GEN_AI_PROVIDER_NAME]: 'anthropic',
        ...(typeof sessionId === 'string' ? { [GEN_AI_CONVERSATION_ID]: sessionId } : {}),
      },
    });

    // A tool shared between runners can't tell its session, so the id reaches its spans through the scope, unless
    // `Sentry.setConversationId()` set one before the session started.
    const setsConversationId =
      typeof sessionId === 'string' &&
      !getCurrentScope().getScopeData().conversationId &&
      !getIsolationScope().getScopeData().conversationId;
    const sessionScope = withActiveSpan(span, scope =>
      setsConversationId ? scope.setConversationId(sessionId) : scope,
    );
    const isolationScope = getIsolationScope();

    return {
      span,
      runInSession: callback => withIsolationScope(isolationScope, () => withScope(sessionScope, callback)),
    };
  });
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
  const original = (owner as Record<string | symbol, unknown>)[key];
  if (typeof original !== 'function' || getOriginalFunction(original as WrappedFunction)) {
    return;
  }

  const wrapped = function (this: unknown, ...args: unknown[]): unknown {
    return call(original as AnyFunction, this, args);
  };
  markFunctionWrapped(wrapped, original);
  try {
    (owner as Record<string | symbol, unknown>)[key] = wrapped;
  } catch {
    DEBUG_BUILD && debug.log(`[Anthropic] could not instrument ${String(key)}, so it runs untraced`);
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
