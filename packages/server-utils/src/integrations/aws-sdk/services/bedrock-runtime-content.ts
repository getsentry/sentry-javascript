import { isObjectLike, stringify } from '@sentry/core';
import {
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_SYSTEM_INSTRUCTIONS,
  GEN_AI_TOOL_DEFINITIONS,
} from '@sentry/conventions/attributes';
import { getMessagesAttributes, messagesFromParams } from '../../../ai/anthropic-ai/utils';
import type { GenAiMessagePart } from '../../../ai/types';

/**
 * Translate Converse `ContentBlock`s (also used by Amazon Nova `InvokeModel` bodies) into message parts.
 * The conventions require a `type` on each part, and Bedrock's blocks (`{ text }`, `{ toolUse }`, ...) have none.
 *
 * Media is reported by modality only: inline media is raw bytes, which the conventions require to be
 * dropped rather than recorded. Blocks without content worth recording (`cachePoint`, redacted
 * reasoning, unknown members) are left out rather than serialized, so no binary payload slips through.
 */
function contentBlocksToParts(content: unknown): GenAiMessagePart[] {
  return Array.isArray(content) ? content.flatMap(contentBlockToParts) : [];
}

function contentBlockToParts(block: unknown): GenAiMessagePart[] {
  if (!isObjectLike(block)) {
    return [];
  }

  if (typeof block.text === 'string') {
    return [{ type: 'text', content: block.text }];
  }

  const { toolUse, toolResult, reasoningContent, guardContent, citationsContent } = block;

  if (isObjectLike(toolUse)) {
    return [
      {
        type: 'tool_call',
        id: toolUse.toolUseId,
        name: toolUse.name,
        arguments: stringify(toolUse.input ?? {}, String),
      },
    ];
  }

  if (isObjectLike(toolResult)) {
    return [{ type: 'tool_call_response', id: toolResult.toolUseId, result: toolResultToString(toolResult.content) }];
  }

  if (isObjectLike(reasoningContent)) {
    const reasoningText = reasoningContent.reasoningText;
    return isObjectLike(reasoningText) && typeof reasoningText.text === 'string'
      ? [{ type: 'reasoning', content: reasoningText.text }]
      : [];
  }

  if (isObjectLike(guardContent)) {
    // `guardContent.text` is a `{ text }` block, `guardContent.image` an image block.
    return contentBlockToParts(isObjectLike(guardContent.text) ? guardContent.text : guardContent);
  }

  if (isObjectLike(citationsContent)) {
    return contentBlocksToParts(citationsContent.content);
  }

  for (const modality of ['image', 'video', 'audio', 'document']) {
    const media = block[modality];
    if (isObjectLike(media)) {
      // Only image formats (`png`, ...) map to a MIME type by prefix; `undefined` is left out of the JSON.
      const format = modality === 'image' && typeof media.format === 'string' ? `image/${media.format}` : undefined;
      return [{ type: 'blob', modality, mime_type: format }];
    }
  }

  return [];
}

function toolResultToString(content: unknown): string {
  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .map(block => {
      if (!isObjectLike(block)) {
        return undefined;
      }
      if (typeof block.text === 'string') {
        return block.text;
      }
      return block.json !== undefined ? stringify(block.json, String) : undefined;
    })
    .filter((text): text is string => text !== undefined)
    .join('\n');
}

function converseMessagesToMessages(messages: unknown): Array<{ role: string; parts: GenAiMessagePart[] }> {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .filter(isObjectLike)
    .map(message => ({
      role: typeof message.role === 'string' ? message.role : 'user',
      parts: contentBlocksToParts(message.content),
    }))
    .filter(message => message.parts.length > 0);
}

/**
 * Input attributes of a Converse-shaped request (`Converse`, `ConverseStream`, and Amazon Nova
 * `InvokeModel` bodies, which use the same `messages`/`system`/`toolConfig` shape).
 */
export function getConverseInputAttributes(input: Record<string, unknown>): Record<string, unknown> {
  const attributes: Record<string, unknown> = {};

  const systemInstructions = contentBlocksToParts(input.system);
  if (systemInstructions.length) {
    attributes[GEN_AI_SYSTEM_INSTRUCTIONS] = JSON.stringify(systemInstructions);
  }

  const messages = converseMessagesToMessages(input.messages);
  if (messages.length) {
    attributes[GEN_AI_INPUT_MESSAGES] = JSON.stringify(messages);
  }

  const toolConfig = input.toolConfig;
  if (isObjectLike(toolConfig) && Array.isArray(toolConfig.tools)) {
    // `cachePoint` entries share the list with the `toolSpec`s; they are not tools.
    const toolSpecs = toolConfig.tools
      .map(tool => (isObjectLike(tool) ? tool.toolSpec : undefined))
      .filter(isObjectLike);
    if (toolSpecs.length) {
      attributes[GEN_AI_TOOL_DEFINITIONS] = JSON.stringify(toolSpecs);
    }
  }

  return attributes;
}

/**
 * Claude `InvokeModel` bodies are Anthropic Messages API requests, so they are recorded like the Anthropic
 * integration records them.
 */
export function getClaudeInputAttributes(body: Record<string, unknown>): Record<string, unknown> {
  const attributes = getMessagesAttributes(messagesFromParams(body));
  if (Array.isArray(body.tools)) {
    attributes[GEN_AI_TOOL_DEFINITIONS] = JSON.stringify(body.tools);
  }
  return attributes;
}

/** Input attributes of the single-prompt `InvokeModel` bodies (Titan, Llama, Cohere, Mistral, ...). */
export function getPromptInputAttributes(prompt: unknown): Record<string, unknown> {
  if (typeof prompt !== 'string') {
    return {};
  }
  return { [GEN_AI_INPUT_MESSAGES]: JSON.stringify([{ role: 'user', parts: [{ type: 'text', content: prompt }] }]) };
}
