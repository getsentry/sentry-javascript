import type { Span, SpanStatus } from '@sentry/core';
import { getActiveSpan, SPAN_STATUS_ERROR, startInactiveSpan, stringify } from '@sentry/core';
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
  GEN_AI_TOOL_DEFINITIONS,
  SENTRY_ORIGIN,
} from '@sentry/conventions/attributes';
import { recordTimeToFirstChunk } from '../core/time-to-first-chunk';
import type { GenAiOptions } from '../core/utils';
import { getErrorStatus, getGenAiSpanOp, resolveAIRecordingOptions, setOutputMessagesAttribute } from '../core/utils';
import { TANSTACK_AI_MIDDLEWARE_BRAND, TANSTACK_AI_ORIGIN } from './constants';
import type {
  TanstackAICallInfo,
  TanstackAIChatMiddleware,
  TanstackAIMiddlewareConfig,
  TanstackAIMiddlewareContext,
} from './types';
import { getInputAttributes, getProviderName, getRequestAttributes, getUsageAttributes } from './utils';

export type TanstackAIOptions = GenAiOptions;

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
  const { recordInputs, recordOutputs } = resolveAIRecordingOptions(options);
  // `ctx.streaming` is also true when `chat()` returns a promise, because `chat()` reads the same stream
  // inside. With `outputSchema`, `chat()` streams only with `stream: true`.
  const streaming = call.outputSchema ? call.stream === true : call.stream !== false;

  let agentSpan: Span | undefined;
  let chatSpan: Span | undefined;
  let outputText = '';
  let outputToolCalls: Array<{ id: string; name?: string; arguments: unknown }> = [];
  // `TOOL_CALL_END` has the arguments but not the name, which only `TOOL_CALL_START` has.
  const toolCallNames = new Map<string, string>();

  const endSpan = (span: Span, status?: SpanStatus): void => {
    if (status) {
      span.setStatus(status);
    }
    span.end();
  };

  const endChatSpan = (status?: SpanStatus): void => {
    if (chatSpan) {
      endSpan(chatSpan, status);
      chatSpan = undefined;
    }
  };

  const endRun = (status?: SpanStatus): void => {
    if (!agentSpan) {
      return;
    }
    endChatSpan(status);
    endSpan(agentSpan, status);
    agentSpan = undefined;
  };

  const startChatSpan = (ctx: TanstackAIMiddlewareContext, config: TanstackAIMiddlewareConfig): Span => {
    outputText = '';
    outputToolCalls = [];
    toolCallNames.clear();

    return startInactiveSpan({
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
        agentSpan = startInactiveSpan({
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
        endRun(getErrorStatus(ctx.signal));
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

    onFinish() {
      endRun();
    },

    // Also for an abort from a middleware, which leaves the signal of the caller alone.
    onAbort() {
      endRun({ code: SPAN_STATUS_ERROR, message: 'cancelled' });
    },

    onError(ctx) {
      endRun(getErrorStatus(ctx.signal));
    },
  };
}
