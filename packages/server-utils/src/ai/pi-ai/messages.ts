import { isObjectLike, stringify } from '@sentry/core';
import type { GenAiMessage, GenAiMessagePart } from '../types';

/**
 * Map pi-ai messages (`@earendil-works/pi-ai`, which Flue and pi-durable send) to the gen_ai
 * conventions. Sentry renders neither pi-ai's `toolResult` role nor its `toolCall` parts.
 *
 * System messages are left out: their prompt belongs in `gen_ai.system_instructions`. Messages with
 * a role the conventions do not have are left out too.
 */
export function piAiMessagesToGenAiMessages(messages: unknown): GenAiMessage[] {
  if (!Array.isArray(messages)) {
    return [];
  }

  const mapped: GenAiMessage[] = [];
  for (const message of messages) {
    if (
      !isObjectLike(message) ||
      (message.role !== 'user' && message.role !== 'assistant' && message.role !== 'toolResult')
    ) {
      continue;
    }

    if (message.role === 'toolResult') {
      mapped.push({
        role: 'tool',
        parts: [
          {
            type: 'tool_call_response',
            id: message.toolCallId,
            name: message.toolName,
            result: piAiContentToString(message.content),
          },
        ],
      });
      continue;
    }

    const parts = piAiContentToParts(message.content);
    if (parts.length) {
      mapped.push({ role: message.role, parts });
    }
  }
  return mapped;
}

/** The `gen_ai.output.messages` entry of a pi-ai assistant message, or `undefined` when it has no content. */
export function piAiAssistantMessageToGenAiMessage(message: unknown, finishReason?: string): GenAiMessage | undefined {
  const parts = isObjectLike(message) ? piAiContentToParts(message.content) : [];
  if (!parts.length) {
    return undefined;
  }
  return { role: 'assistant', parts, ...(finishReason ? { finish_reason: finishReason } : {}) };
}

/** pi-ai names a tool-calling stop `toolUse`; the conventions call it `tool_call`. */
export function piAiFinishReason(stopReason: unknown): string | undefined {
  if (typeof stopReason !== 'string' || !stopReason) {
    return undefined;
  }
  return stopReason === 'toolUse' ? 'tool_call' : stopReason;
}

/** Text-only content as its text, joined the way pi-ai joins it; anything else as its mapped parts. */
export function piAiContentToString(content: unknown): string | undefined {
  const parts = piAiContentToParts(content);
  return parts.every(part => part.type === 'text') ? parts.map(part => part.content).join('\n') : stringify(parts);
}

function piAiContentToParts(content: unknown): GenAiMessagePart[] {
  if (typeof content === 'string') {
    return content ? [{ type: 'text', content }] : [];
  }
  if (!Array.isArray(content)) {
    return [];
  }
  return content.map(piAiPartToGenAiPart).filter((part): part is GenAiMessagePart => part !== undefined);
}

/** An image is reported by its media type only: its `data` is base64, which the conventions require to be dropped. */
function piAiPartToGenAiPart(part: unknown): GenAiMessagePart | undefined {
  if (!isObjectLike(part)) {
    return undefined;
  }

  switch (part.type) {
    case 'text':
      // An empty text block makes Sentry render the message as "(no value)" instead of its tool calls.
      return typeof part.text === 'string' && part.text.trim() ? { type: 'text', content: part.text } : undefined;
    case 'thinking':
      // A redacted thinking block carries an encrypted payload, not text.
      return typeof part.thinking === 'string' && part.thinking && !part.redacted
        ? { type: 'reasoning', content: part.thinking }
        : undefined;
    case 'toolCall':
      return { type: 'tool_call', id: part.id, name: part.name, arguments: stringify(part.arguments ?? {}, String) };
    case 'image':
      return { type: 'blob', mime_type: part.mimeType };
    default:
      // Part kinds we don't know yet render as JSON rather than disappearing.
      return { type: 'object', content: part };
  }
}
