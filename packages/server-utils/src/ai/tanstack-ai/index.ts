import type { Span, SpanStatus } from '@sentry/core';
import {
  captureException,
  getActiveSpan,
  SPAN_STATUS_ERROR,
  startInactiveSpan,
  stringify,
  withActiveSpan,
} from '@sentry/core';
import {
  GEN_AI_AGENT_NAME,
  GEN_AI_CONVERSATION_ID,
  GEN_AI_OPERATION_NAME,
  GEN_AI_PROVIDER_NAME,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_RESPONSE_FINISH_REASONS,
  GEN_AI_RESPONSE_ID,
  GEN_AI_RESPONSE_MODEL,
  GEN_AI_RESPONSE_STREAMING,
  GEN_AI_TOOL_CALL_ARGUMENTS,
  GEN_AI_TOOL_CALL_RESULT,
  GEN_AI_TOOL_DEFINITIONS,
  GEN_AI_TOOL_DESCRIPTION,
  GEN_AI_TOOL_NAME,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { GEN_AI_TOOL_CALL_ID_ATTRIBUTE } from '../core/gen-ai-attributes';
import type { GenAiSpanHooks } from '../core/span-hooks';
import { runGenAiSpanEnd, runGenAiSpanStart } from '../core/span-hooks';
import { recordTimeToFirstChunk } from '../core/time-to-first-chunk';
import type { GenAiCallOptions } from '../core/utils';
import { getErrorStatus, getGenAiSpanOp, resolveGenAiCallRecording, setOutputMessagesAttribute } from '../core/utils';
import { TANSTACK_AI_MIDDLEWARE_BRAND, TANSTACK_AI_ORIGIN } from './constants';
import type {
  TanstackAICallInfo,
  TanstackAIChatMiddleware,
  TanstackAIMiddlewareConfig,
  TanstackAIMiddlewareContext,
} from './types';
import { getInputAttributes, getProviderName, getRequestAttributes, getRunError, getUsageAttributes } from './utils';

/**
 * `call` is the options object of the `chat()` call. The recording options run when `chat()` is
 * called. The hooks run for every span (`invoke_agent`, `chat` and `execute_tool`) while the run is
 * read, which can be in another async context than the call. `onSpanEnd` gets the `error` of a
 * failed run or tool.
 */
export type TanstackAIOptions = GenAiCallOptions<TanstackAICallInfo> & GenAiSpanHooks<TanstackAICallInfo>;

// The chunks that carry model output. The adapters send `RUN_STARTED` before the provider answers.
const OUTPUT_CHUNK_TYPES = new Set(['TEXT_MESSAGE_CONTENT', 'TOOL_CALL_START', 'REASONING_MESSAGE_CONTENT']);

/**
 * Makes the chat middleware for one `chat()` call. Call it when `chat()` is called: the parent of the
 * `invoke_agent` span is the span that is active then, and the recording options are decided then.
 * The middleware cannot make its spans active, so the spans of other work in the run do not nest
 * below them.
 */
export function createTanstackAIMiddleware(
  options: TanstackAIOptions,
  call: TanstackAICallInfo,
): TanstackAIChatMiddleware {
  const parentSpan = getActiveSpan() ?? null;
  const { recordInputs, recordOutputs } = resolveGenAiCallRecording(options, call);
  // `ctx.streaming` is also true when `chat()` returns a promise, because `chat()` reads the same stream
  // inside. With `outputSchema`, `chat()` streams only with `stream: true`.
  const streaming = call.outputSchema ? call.stream === true : call.stream !== false;

  let agentSpan: Span | undefined;
  let chatSpan: Span | undefined;
  let outputText = '';
  let outputToolCalls: Array<{ id: string; name?: string; arguments: unknown }> = [];
  // `TOOL_CALL_END` has the arguments but not the name, which only `TOOL_CALL_START` has.
  const toolCallNames = new Map<string, string>();
  const toolSpans = new Map<string, Span>();

  const startSpan = (spanOptions: Parameters<typeof startInactiveSpan>[0]): Span => {
    const span = startInactiveSpan(spanOptions);
    runGenAiSpanStart(options, span, call);
    return span;
  };

  const endSpan = (span: Span, status?: SpanStatus, error?: unknown): void => {
    if (status) {
      span.setStatus(status);
    }
    runGenAiSpanEnd(options, span, call, status ? { error } : {});
    span.end();
  };

  const endChatSpan = (status?: SpanStatus, error?: unknown): void => {
    if (chatSpan) {
      endSpan(chatSpan, status, error);
      chatSpan = undefined;
    }
  };

  const endRun = (status?: SpanStatus, error?: unknown): void => {
    if (!agentSpan) {
      return;
    }
    for (const span of toolSpans.values()) {
      endSpan(span, status, error);
    }
    toolSpans.clear();
    endChatSpan(status, error);
    endSpan(agentSpan, status, error);
    agentSpan = undefined;
  };

  const startChatSpan = (ctx: TanstackAIMiddlewareContext, config: TanstackAIMiddlewareConfig): Span => {
    outputText = '';
    outputToolCalls = [];
    toolCallNames.clear();

    return startSpan({
      name: `chat ${ctx.model}`,
      op: getGenAiSpanOp('chat'),
      parentSpan: agentSpan,
      attributes: {
        [SENTRY_ORIGIN]: TANSTACK_AI_ORIGIN,
        [GEN_AI_OPERATION_NAME]: 'chat',
        [GEN_AI_PROVIDER_NAME]: getProviderName(ctx),
        [GEN_AI_REQUEST_MODEL]: ctx.model,
        [GEN_AI_CONVERSATION_ID]: ctx.threadId,
        [GEN_AI_RESPONSE_STREAMING]: streaming,
        ...getRequestAttributes(config.modelOptions),
        // The `structuredOutput` call sends no tools, but its config still lists them.
        ...(recordInputs && config.tools.length && ctx.phase !== 'structuredOutput'
          ? {
              [GEN_AI_TOOL_DEFINITIONS]: stringify(
                config.tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
              ),
            }
          : {}),
        // A middleware can send the provider other messages than the history of the run.
        ...(recordInputs ? getInputAttributes(config.providerMessages ?? config.messages, config.systemPrompts) : {}),
      },
    });
  };

  return {
    name: 'sentry',
    [TANSTACK_AI_MIDDLEWARE_BRAND]: true,

    onConfig(ctx, config) {
      // `init` runs once per run, before `onStart` and before any tool can run.
      if (ctx.phase === 'init' && !agentSpan) {
        const agentName = ctx.subagentName;
        agentSpan = startSpan({
          name: agentName ? `invoke_agent ${agentName}` : 'invoke_agent',
          op: getGenAiSpanOp('invoke_agent'),
          parentSpan,
          attributes: {
            [SENTRY_ORIGIN]: TANSTACK_AI_ORIGIN,
            [GEN_AI_OPERATION_NAME]: 'invoke_agent',
            [GEN_AI_PROVIDER_NAME]: getProviderName(ctx),
            [GEN_AI_REQUEST_MODEL]: ctx.model,
            [GEN_AI_CONVERSATION_ID]: ctx.threadId,
            [GEN_AI_RESPONSE_STREAMING]: streaming,
            [GEN_AI_AGENT_NAME]: agentName,
            ...(recordInputs ? getInputAttributes(config.messages, config.systemPrompts) : {}),
          },
        });
      }

      // `beforeModel` starts each model call of the agent loop. `structuredOutput` starts the
      // separate last call for `outputSchema`.
      if (!agentSpan || (ctx.phase !== 'beforeModel' && ctx.phase !== 'structuredOutput')) {
        return;
      }
      // A model call that completes ends its span at the `afterModel` boundary. A span that is still
      // open here is of a call that failed and that a middleware retried with `ctx.retry()`.
      endChatSpan({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
      chatSpan = startChatSpan(ctx, config);
    },

    onChunk(ctx, chunk) {
      if (!agentSpan) {
        return;
      }
      if (chunk.type === 'RUN_FINISHED' || chunk.type === 'RUN_ERROR') {
        // TanStack sets the call metadata of the `structuredOutput` call only after `onConfig`.
        const provider = getProviderName(ctx);
        chatSpan?.setAttribute(GEN_AI_PROVIDER_NAME, provider);
        agentSpan.setAttribute(GEN_AI_PROVIDER_NAME, provider);
      }
      // A provider error ends the run with this chunk. `chat({ stream: false })` then throws and
      // stops reading, so TanStack calls no terminal hook.
      if (chunk.type === 'RUN_ERROR') {
        endRun(getErrorStatus(ctx.signal), getRunError(chunk));
        return;
      }
      // A run that stops at an interrupt ends with this chunk. For an interrupt at `beforeModel` or
      // `afterModel`, TanStack calls no terminal hook.
      if (chunk.type === 'RUN_FINISHED' && chunk.outcome?.type === 'interrupt') {
        endRun();
        return;
      }
      if (!chatSpan) {
        return;
      }

      if (streaming && OUTPUT_CHUNK_TYPES.has(chunk.type)) {
        recordTimeToFirstChunk(chatSpan);
      }

      if (chunk.type === 'TEXT_MESSAGE_CONTENT' && recordOutputs && chunk.delta) {
        outputText += chunk.delta;
      } else if (chunk.type === 'TOOL_CALL_START' && chunk.toolCallId && chunk.toolCallName) {
        toolCallNames.set(chunk.toolCallId, chunk.toolCallName);
      } else if (chunk.type === 'TOOL_CALL_END' && recordOutputs && chunk.toolCallId) {
        outputToolCalls.push({
          id: chunk.toolCallId,
          name: toolCallNames.get(chunk.toolCallId),
          arguments: chunk.input ?? {},
        });
      } else if (chunk.type === 'RUN_FINISHED') {
        // An adapter can report these only in the `metadata.tanstack` of the chunk. TanStack copies
        // them into `callMetadata` before the middleware gets the chunk.
        const responseModel = chunk.model ?? ctx.callMetadata?.model;
        const responseId = chunk.responseId ?? ctx.callMetadata?.responseId;
        const finishReason = chunk.finishReason ?? undefined;
        if (finishReason) {
          chatSpan.setAttribute(GEN_AI_RESPONSE_FINISH_REASONS, stringify([finishReason]));
        }
        // The agent span keeps the response of the last model call, which is the answer of the run.
        for (const span of [chatSpan, agentSpan]) {
          if (responseModel) {
            span.setAttribute(GEN_AI_RESPONSE_MODEL, responseModel);
          }
          if (responseId) {
            span.setAttribute(GEN_AI_RESPONSE_ID, responseId);
          }
          if (recordOutputs) {
            setOutputMessagesAttribute(span, { responseText: outputText, toolCalls: outputToolCalls, finishReason });
          }
        }
      }
    },

    // Runs after each model call and before the tools it asked for, so the `chat` span does not
    // include the tools.
    onInterruptBoundary(ctx) {
      if (ctx.phase === 'afterModel') {
        endChatSpan();
      }
    },

    onUsage(_ctx, usage) {
      chatSpan?.setAttributes(getUsageAttributes(usage));
    },

    // The guards run after all `onBeforeToolCall` decisions and after the input check, so `args`
    // are the arguments that the tool gets.
    onGuardToolCall(ctx, { toolName, toolCallId, args, tool }) {
      // A client tool runs in the browser, not here.
      if (!agentSpan || (tool && typeof tool.execute !== 'function')) {
        return;
      }
      toolSpans.set(
        toolCallId,
        startSpan({
          name: `execute_tool ${toolName}`,
          op: getGenAiSpanOp('execute_tool'),
          parentSpan: agentSpan,
          attributes: {
            [SENTRY_ORIGIN]: TANSTACK_AI_ORIGIN,
            [GEN_AI_OPERATION_NAME]: 'execute_tool',
            [GEN_AI_TOOL_NAME]: toolName,
            [GEN_AI_TOOL_CALL_ID_ATTRIBUTE]: toolCallId,
            [GEN_AI_CONVERSATION_ID]: ctx.threadId,
            [GEN_AI_TOOL_DESCRIPTION]: tool?.description,
            ...(recordInputs ? { [GEN_AI_TOOL_CALL_ARGUMENTS]: stringify(args) } : {}),
          },
        }),
      );
    },

    onAfterToolCall(ctx, { toolCallId, ok, result, error }) {
      const span = toolSpans.get(toolCallId);
      if (!span) {
        return;
      }
      toolSpans.delete(toolCallId);

      if (recordOutputs && ok && result !== undefined) {
        span.setAttribute(GEN_AI_TOOL_CALL_RESULT, typeof result === 'string' ? result : stringify(result));
      }
      if (ok) {
        endSpan(span);
        return;
      }
      // TanStack fails each tool that did not start yet with an `Operation aborted` error.
      const status = getErrorStatus(ctx.signal);
      if (status.message === 'internal_error') {
        // TanStack gives a tool failure back to the model as the tool result, so the error handlers
        // of the app never see it.
        withActiveSpan(span, () => {
          captureException(error, { mechanism: { type: TANSTACK_AI_ORIGIN, handled: false } });
        });
      }
      endSpan(span, status, error);
    },

    onFinish() {
      endRun();
    },

    // Also for an abort from a middleware, which leaves the signal of the caller alone.
    onAbort() {
      endRun({ code: SPAN_STATUS_ERROR, message: 'cancelled' });
    },

    onError(ctx, { error }) {
      endRun(getErrorStatus(ctx.signal), error);
    },
  };
}
