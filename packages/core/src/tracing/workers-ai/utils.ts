/* eslint-disable typescript-eslint/no-deprecated */
import {
  GEN_AI_EMBEDDINGS_INPUT,
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OPERATION_NAME,
  GEN_AI_OUTPUT_MESSAGES,
  GEN_AI_PROVIDER_NAME,
  GEN_AI_REQUEST_FREQUENCY_PENALTY,
  GEN_AI_REQUEST_MAX_TOKENS,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_REQUEST_PRESENCE_PENALTY,
  GEN_AI_REQUEST_TEMPERATURE,
  GEN_AI_REQUEST_TOP_K,
  GEN_AI_REQUEST_TOP_P,
  GEN_AI_RESPONSE_TEXT,
  GEN_AI_RESPONSE_TOOL_CALLS,
  GEN_AI_SYSTEM_INSTRUCTIONS,
} from '@sentry/conventions/attributes';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '../../semanticAttributes';
import type { Span, SpanAttributeValue } from '../../types/span';
import { GEN_AI_REQUEST_STREAM_ATTRIBUTE } from '../ai/gen-ai-attributes';
import { extractSystemInstructions, getTruncatedJsonString, setTokenUsageAttributes } from '../ai/utils';
import { stringify } from '../../utils/string';
import { WORKERS_AI_ORIGIN, WORKERS_AI_PROVIDER_NAME } from './constants';
import type { WorkersAiInput, WorkersAiOutput } from './types';

/**
 * Determine the gen_ai operation name from the inputs passed to `AI.run`.
 * Workers AI exposes a single `run` method, so we infer the operation from the input shape.
 */
export function getOperationName(inputs: unknown): string {
  if (inputs && typeof inputs === 'object') {
    if ('messages' in inputs || 'prompt' in inputs) {
      return 'chat';
    }
    if ('text' in inputs) {
      return 'embeddings';
    }
  }
  return 'chat';
}

/**
 * Extract the request attributes (model, request parameters, system, origin) from a `run` call.
 */
export function extractRequestAttributes(
  model: unknown,
  inputs: unknown,
  operationName: string,
): Record<string, SpanAttributeValue> {
  const attributes: Record<string, SpanAttributeValue> = {
    [GEN_AI_PROVIDER_NAME]: WORKERS_AI_PROVIDER_NAME,
    [GEN_AI_OPERATION_NAME]: operationName,
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: WORKERS_AI_ORIGIN,
    [GEN_AI_REQUEST_MODEL]: typeof model === 'string' ? model : 'unknown',
  };

  if (inputs && typeof inputs === 'object') {
    const params = inputs as WorkersAiInput;

    if (typeof params.temperature === 'number') {
      attributes[GEN_AI_REQUEST_TEMPERATURE] = params.temperature;
    }
    if (typeof params.max_tokens === 'number') {
      attributes[GEN_AI_REQUEST_MAX_TOKENS] = params.max_tokens;
    }
    if (typeof params.top_p === 'number') {
      attributes[GEN_AI_REQUEST_TOP_P] = params.top_p;
    }
    if (typeof params.top_k === 'number') {
      attributes[GEN_AI_REQUEST_TOP_K] = params.top_k;
    }
    if (typeof params.frequency_penalty === 'number') {
      attributes[GEN_AI_REQUEST_FREQUENCY_PENALTY] = params.frequency_penalty;
    }
    if (typeof params.presence_penalty === 'number') {
      attributes[GEN_AI_REQUEST_PRESENCE_PENALTY] = params.presence_penalty;
    }
    if (params.stream === true) {
      attributes[GEN_AI_REQUEST_STREAM_ATTRIBUTE] = true;
    }
  }

  return attributes;
}

/**
 * Record the request inputs (messages/prompt/embeddings input) on the span.
 * Only called when `recordInputs` is enabled.
 */
export function addRequestAttributes(
  span: Span,
  inputs: unknown,
  operationName: string,
  enableTruncation: boolean,
): void {
  if (!inputs || typeof inputs !== 'object') {
    return;
  }
  const params = inputs as WorkersAiInput;

  // Store embeddings input on a separate attribute and do not truncate it
  if (operationName === 'embeddings') {
    const text = params.text;

    if (text == null || (typeof text === 'string' && text.length === 0) || (Array.isArray(text) && text.length === 0)) {
      return;
    }

    span.setAttribute(GEN_AI_EMBEDDINGS_INPUT, typeof text === 'string' ? text : JSON.stringify(text));
    return;
  }

  const src = params.messages ?? params.prompt;

  if (src == null || (Array.isArray(src) && src.length === 0)) {
    return;
  }

  const { systemInstructions, filteredMessages } = extractSystemInstructions(src);

  if (systemInstructions) {
    span.setAttribute(GEN_AI_SYSTEM_INSTRUCTIONS, systemInstructions);
  }

  span.setAttribute(
    GEN_AI_INPUT_MESSAGES,
    enableTruncation ? getTruncatedJsonString(filteredMessages) : stringify(filteredMessages),
  );
}

/**
 * Build the `gen_ai.output.messages` value (a single assistant message with text and/or
 * tool-call parts) from the response text and tool calls.
 *
 * We set this in addition to the deprecated `gen_ai.response.text` / `gen_ai.response.tool_calls`
 * attributes because Sentry's product reads the model output from `gen_ai.output.messages` first.
 * Relay migrates `gen_ai.response.text` into `gen_ai.output.messages`, but the tool-calls half of
 * that migration is lossy — so tool-call turns would otherwise render an empty Output. Emitting the
 * normalized message here (mirroring the Vercel AI integration) keeps tool calls visible.
 */
export function setOutputMessagesAttribute(
  span: Span,
  { responseText, toolCalls }: { responseText?: string; toolCalls?: unknown[] },
): void {
  const parts: Array<Record<string, unknown>> = [];

  if (typeof responseText === 'string' && responseText.length > 0) {
    parts.push({ type: 'text', content: responseText });
  }

  if (Array.isArray(toolCalls)) {
    for (const toolCall of toolCalls) {
      if (!toolCall || typeof toolCall !== 'object') {
        continue;
      }
      const call = toolCall as {
        id?: unknown;
        function?: { name?: unknown; arguments?: unknown };
        name?: unknown;
        arguments?: unknown;
      };
      // Normalize both the OpenAI-compatible shape (name/arguments nested under `function`)
      // and the native Workers AI shape (name/arguments at the top level).
      const name = call.function?.name ?? call.name;
      const args = call.function?.arguments ?? call.arguments;
      parts.push({
        type: 'tool_call',
        id: call.id,
        name,
        arguments: typeof args === 'string' ? args : JSON.stringify(args ?? {}),
      });
    }
  }

  if (parts.length > 0) {
    span.setAttribute(GEN_AI_OUTPUT_MESSAGES, JSON.stringify([{ role: 'assistant', parts }]));
  }
}

/**
 * Record the response attributes (token usage, response text, tool calls) on the span.
 */
export function addResponseAttributes(span: Span, result: unknown, recordOutputs: boolean): void {
  if (
    !result ||
    typeof result !== 'object' ||
    // Raw `Response` objects (from `returnRawResponse`/`websocket`) cannot be introspected without consuming them.
    (typeof Response !== 'undefined' && result instanceof Response)
  ) {
    return;
  }

  const response = result as WorkersAiOutput;

  if (response.usage) {
    setTokenUsageAttributes(span, response.usage.prompt_tokens, response.usage.completion_tokens);
  }

  if (recordOutputs) {
    let responseText: string | undefined;
    if (typeof response.response === 'string') {
      responseText = response.response;
      span.setAttribute(GEN_AI_RESPONSE_TEXT, response.response);
    } else if (response.response != null) {
      responseText = JSON.stringify(response.response);
      span.setAttribute(GEN_AI_RESPONSE_TEXT, responseText);
    }

    const toolCalls =
      Array.isArray(response.tool_calls) && response.tool_calls.length > 0 ? response.tool_calls : undefined;
    if (toolCalls) {
      span.setAttribute(GEN_AI_RESPONSE_TOOL_CALLS, JSON.stringify(toolCalls));
    }

    setOutputMessagesAttribute(span, { responseText, toolCalls });
  }
}
