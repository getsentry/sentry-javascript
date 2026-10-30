import type { Span, StartSpanOptions } from '@sentry/core';
import {
  getCurrentScope,
  getIsolationScope,
  isURLObjectRelative,
  parseStringToURLObject,
  SPAN_STATUS_ERROR,
  stringify,
} from '@sentry/core';
import {
  GEN_AI_CONVERSATION_ID,
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OPERATION_NAME,
  GEN_AI_OUTPUT_MESSAGES,
  GEN_AI_PROVIDER_NAME,
  GEN_AI_REQUEST_MAX_TOKENS,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_REQUEST_REASONING_LEVEL,
  GEN_AI_REQUEST_TEMPERATURE,
  GEN_AI_RESPONSE_FINISH_REASONS,
  GEN_AI_RESPONSE_ID,
  GEN_AI_RESPONSE_MODEL,
  GEN_AI_RESPONSE_STREAMING,
  GEN_AI_SYSTEM_INSTRUCTIONS,
  GEN_AI_TOOL_DEFINITIONS,
  SENTRY_ORIGIN,
  SERVER_ADDRESS,
  SERVER_PORT,
} from '@sentry/conventions/attributes';
import { GEN_AI_CHAT } from '@sentry/conventions/op';
import { PI_AI_ORIGIN } from './constants';
import type { PiAiContext } from './messages';
import {
  piAiAssistantMessageToGenAiMessage,
  piAiFinishReason,
  piAiMessagesToGenAiMessages,
  piAiSystemInstructions,
  piAiToolDefinitions,
} from './messages';
import type { PiAssistantMessage, PiModel, PiStreamOptions } from './types';
import { setPiAiUsageAttributes } from './usage';

export interface PiAiChatRequest {
  model: PiModel;
  /** Absent for the deferred calls, which pass a handle in place of the request context. */
  context?: PiAiContext;
  callOptions?: PiStreamOptions;
  streaming: boolean;
  recordInputs: boolean;
}

/**
 * The span options of the `gen_ai.chat` span of a pi-ai request. Returned rather than started so
 * the caller picks whether the span is active while the request is sent.
 */
export function getPiAiChatSpanOptions(request: PiAiChatRequest): StartSpanOptions {
  const { model, context, callOptions, streaming, recordInputs } = request;
  const conversationId =
    getCurrentScope().getScopeData().conversationId ?? getIsolationScope().getScopeData().conversationId;

  return {
    name: model.id ? `chat ${model.id}` : 'chat',
    op: GEN_AI_CHAT,
    attributes: {
      [SENTRY_ORIGIN]: PI_AI_ORIGIN,
      [GEN_AI_OPERATION_NAME]: 'chat',
      [GEN_AI_PROVIDER_NAME]: model.provider,
      [GEN_AI_REQUEST_MODEL]: model.id,
      [GEN_AI_CONVERSATION_ID]: conversationId,
      [GEN_AI_RESPONSE_STREAMING]: streaming || undefined,
      [GEN_AI_REQUEST_TEMPERATURE]: callOptions?.temperature,
      [GEN_AI_REQUEST_MAX_TOKENS]: callOptions?.maxTokens,
      [GEN_AI_REQUEST_REASONING_LEVEL]: callOptions?.reasoning,
      ...getServerAttributes(model),
      ...(recordInputs && context ? getRequestContentAttributes(context) : {}),
    },
  };
}

/**
 * Record the settled message of a pi-ai request on its span. pi-ai never rejects a request: a
 * provider failure or an abort settles as a message with `stopReason` `error` or `aborted`.
 */
export function setPiAiResponseAttributes(span: Span, message: PiAssistantMessage, recordOutputs: boolean): void {
  const { responseModel, model, responseId, stopReason, usage } = message;

  const finishReason = piAiFinishReason(stopReason);
  const output = recordOutputs ? piAiAssistantMessageToGenAiMessage(message, finishReason) : undefined;

  span.setAttributes({
    [GEN_AI_RESPONSE_MODEL]: responseModel ?? model,
    [GEN_AI_RESPONSE_ID]: responseId,
    [GEN_AI_RESPONSE_FINISH_REASONS]: finishReason ? stringify([finishReason]) : undefined,
    [GEN_AI_OUTPUT_MESSAGES]: output ? stringify([output], String) : undefined,
  });

  const failed = stopReason === 'error';
  setPiAiUsageAttributes(span, usage, failed || stopReason === 'deferred');

  if (failed) {
    span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
  } else if (stopReason === 'aborted') {
    span.setStatus({ code: SPAN_STATUS_ERROR, message: 'cancelled' });
  }
}

function getServerAttributes(model: PiModel): Record<string, string | number | undefined> {
  const url = model.baseUrl ? parseStringToURLObject(model.baseUrl) : undefined;
  if (!url || isURLObjectRelative(url) || !url.hostname) {
    return {};
  }
  return { [SERVER_ADDRESS]: url.hostname, [SERVER_PORT]: url.port ? Number(url.port) : undefined };
}

function getRequestContentAttributes(context: PiAiContext): Record<string, string | undefined> {
  const messages = piAiMessagesToGenAiMessages(context.messages);
  const tools = piAiToolDefinitions(context);
  return {
    [GEN_AI_SYSTEM_INSTRUCTIONS]: piAiSystemInstructions(context),
    [GEN_AI_INPUT_MESSAGES]: messages.length ? stringify(messages) : undefined,
    [GEN_AI_TOOL_DEFINITIONS]: tools.length ? stringify(tools) : undefined,
  };
}
