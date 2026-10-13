import type { Span, WrappedFunction } from '@sentry/core';
import {
  captureException,
  fill,
  getOriginalFunction,
  handleCallbackErrors,
  SPAN_STATUS_ERROR,
  startSpan,
  stringify,
} from '@sentry/core';
import {
  GEN_AI_OPERATION_NAME,
  GEN_AI_TOOL_CALL_ARGUMENTS,
  GEN_AI_TOOL_CALL_RESULT,
  GEN_AI_TOOL_DESCRIPTION,
  GEN_AI_TOOL_NAME,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { GEN_AI_EXECUTE_TOOL } from '@sentry/conventions/op';
import { GEN_AI_TOOL_CALL_ID_ATTRIBUTE } from '../core/gen-ai-attributes';
import { resolveAIRecordingOptions } from '../core/utils';
import { ANTHROPIC_AI_ORIGIN } from './constants';
import type { AnthropicAiOptions } from './types';

type AnyFunction = (...args: unknown[]) => unknown;
type RunnableTool = { name?: unknown; description?: unknown };
type RunContext = { toolUse?: { id?: unknown }; signal?: AbortSignal } | undefined;
type ToolRunner = { params?: { tools?: unknown } };

/** Wrap `beta.messages.toolRunner()` so the runners it returns trace their tool calls. */
export function instrumentToolRunnerMethod(messages: object, options: AnthropicAiOptions): void {
  wrapInPlace(messages, 'toolRunner', (toolRunner, thisArg, args) => {
    const runner = toolRunner.apply(thisArg, args);
    instrumentToolRunner(runner, options);
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

function instrumentTools(tools: unknown, options: AnthropicAiOptions): void {
  if (!Array.isArray(tools)) {
    return;
  }

  for (const tool of tools) {
    if (tool && typeof tool === 'object') {
      wrapInPlace(tool, 'run', (run, thisArg, args) => runWithSpan(tool as RunnableTool, run, thisArg, args, options));
    }
  }
}

function wrapInPlace(
  owner: object,
  key: string,
  call: (original: AnyFunction, thisArg: unknown, args: unknown[]) => unknown,
): void {
  const current = (owner as Record<string, unknown>)[key];
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
  const name = typeof tool.name === 'string' ? tool.name : 'unknown';
  const callId = context?.toolUse?.id;

  return startSpan(
    {
      name: `execute_tool ${name}`,
      op: GEN_AI_EXECUTE_TOOL,
      attributes: {
        [SENTRY_ORIGIN]: ANTHROPIC_AI_ORIGIN,
        [GEN_AI_OPERATION_NAME]: 'execute_tool',
        [GEN_AI_TOOL_NAME]: name,
        [GEN_AI_TOOL_DESCRIPTION]: typeof tool.description === 'string' ? tool.description : undefined,
        [GEN_AI_TOOL_CALL_ID_ATTRIBUTE]: typeof callId === 'string' ? callId : undefined,
        [GEN_AI_TOOL_CALL_ARGUMENTS]: recordInputs ? stringify(input) : undefined,
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

  // The runner turns the throw into an error result for the model, so the app never sees it.
  // A `ToolError` is the SDK's way to send that result on purpose.
  if ((error as Error | undefined)?.name !== 'ToolError') {
    captureException(error, { mechanism: { handled: false, type: `${ANTHROPIC_AI_ORIGIN}.tool_error` } });
  }
}
