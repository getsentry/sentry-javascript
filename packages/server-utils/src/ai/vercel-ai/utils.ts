/* eslint-disable typescript-eslint/no-deprecated */
import { stringify } from '@sentry/core';
import type { Span, SpanAttributes } from '@sentry/core';
import { GEN_AI_INPUT_MESSAGES, GEN_AI_SYSTEM_INSTRUCTIONS } from '@sentry/conventions/attributes';
import { extractSystemInstructions } from '../core/utils';
import { toolCallSpanContextMap } from './constants';
import type { ToolCallSpanContext } from './types';
import { AI_PROMPT_ATTRIBUTE, AI_PROMPT_MESSAGES_ATTRIBUTE } from './vercel-ai-attributes';

/**
 * Get the span context associated with a tool call ID.
 */
export function _INTERNAL_getSpanContextForToolCallId(toolCallId: string): ToolCallSpanContext | undefined {
  return toolCallSpanContextMap.get(toolCallId);
}

/**
 * Clean up the span mapping for a tool call ID
 */
export function _INTERNAL_cleanupToolCallSpanContext(toolCallId: string): void {
  toolCallSpanContextMap.delete(toolCallId);
}

/**
 * Convert an array of tool strings to a JSON string
 */
export function convertAvailableToolsToJsonString(tools: unknown[]): string {
  const toolObjects = tools.map(tool => {
    if (typeof tool === 'string') {
      try {
        return JSON.parse(tool);
      } catch {
        return tool;
      }
    }
    return tool;
  });
  return JSON.stringify(toolObjects);
}

/**
 * Filter out invalid entries in messages array
 * @param input - The input array to filter
 * @returns The filtered array
 */
function filterMessagesArray(input: unknown[]): { role: string; content: string }[] {
  return input.filter(
    (m: unknown): m is { role: string; content: string } =>
      !!m && typeof m === 'object' && 'role' in m && 'content' in m,
  );
}

/**
 * Normalize the user input (stringified object with prompt, system, messages) to messages array
 */
export function convertUserInputToMessagesFormat(userInput: string): { role: string; content: string }[] {
  try {
    const p = JSON.parse(userInput);
    if (!!p && typeof p === 'object') {
      let { messages } = p;
      const { prompt, system } = p;
      const result: { role: string; content: string }[] = [];

      // prepend top-level system instruction if present
      if (typeof system === 'string') {
        result.push({ role: 'system', content: system });
      }

      // stringified messages array
      if (typeof messages === 'string') {
        try {
          messages = JSON.parse(messages);
        } catch {
          // ignore parse errors
        }
      }

      // messages array format: { messages: [...] }
      if (Array.isArray(messages)) {
        result.push(...filterMessagesArray(messages));
        return result;
      }

      // prompt array format: { prompt: [...] }
      if (Array.isArray(prompt)) {
        result.push(...filterMessagesArray(prompt));
        return result;
      }

      // prompt string format: { prompt: "..." }
      if (typeof prompt === 'string') {
        result.push({ role: 'user', content: prompt });
      }

      if (result.length > 0) {
        return result;
      }
    }
    // eslint-disable-next-line no-empty
  } catch {}
  return [];
}

/**
 * Generate a request.messages JSON array from the prompt field in the
 * invoke_agent op
 */
export function requestMessagesFromPrompt(span: Span, attributes: SpanAttributes): void {
  if (
    typeof attributes[AI_PROMPT_ATTRIBUTE] === 'string' &&
    !attributes[GEN_AI_INPUT_MESSAGES] &&
    !attributes[AI_PROMPT_MESSAGES_ATTRIBUTE]
  ) {
    // No messages array is present, so we need to convert the prompt to the proper messages format
    // This is the case for ai.generateText spans
    // The ai.prompt attribute is a stringified object with prompt, system, messages attributes
    // The format of these is described in the vercel docs, for instance: https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-object#parameters
    const userInput = attributes[AI_PROMPT_ATTRIBUTE];
    const messages = convertUserInputToMessagesFormat(userInput);
    if (messages.length) {
      const { systemInstructions, filteredMessages } = extractSystemInstructions(messages);

      if (systemInstructions) {
        span.setAttribute(GEN_AI_SYSTEM_INSTRUCTIONS, systemInstructions);
      }

      const messagesJson = stringify(filteredMessages);

      span.setAttributes({
        [AI_PROMPT_ATTRIBUTE]: messagesJson,
        [GEN_AI_INPUT_MESSAGES]: messagesJson,
      });
    }
  } else if (typeof attributes[AI_PROMPT_MESSAGES_ATTRIBUTE] === 'string') {
    // In this case we already get a properly formatted messages array, this is the preferred way to get the messages
    // This is the case for ai.generateText.doGenerate spans
    const originalMessagesJson = attributes[AI_PROMPT_MESSAGES_ATTRIBUTE];
    try {
      const messages = JSON.parse(originalMessagesJson);
      if (Array.isArray(messages)) {
        const { systemInstructions, filteredMessages } = extractSystemInstructions(messages);

        if (systemInstructions) {
          span.setAttribute(GEN_AI_SYSTEM_INSTRUCTIONS, systemInstructions);
        }

        const messagesJson = stringify(filteredMessages);

        span.setAttributes({
          [AI_PROMPT_MESSAGES_ATTRIBUTE]: messagesJson,
          [GEN_AI_INPUT_MESSAGES]: messagesJson,
        });
      }
      // eslint-disable-next-line no-empty
    } catch {}
  }
}
