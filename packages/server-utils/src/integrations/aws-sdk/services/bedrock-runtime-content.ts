import { isObjectLike, stringify } from '@sentry/core';
import {
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_SYSTEM_INSTRUCTIONS,
  GEN_AI_TOOL_DEFINITIONS,
} from '@sentry/conventions/attributes';

/**
 * A message part as described in https://develop.sentry.dev/sdk/telemetry/traces/modules/ai-agents/.
 * Bedrock's own content blocks (`{ text }`, `{ toolUse }`, ...) carry no `type`, and parts Sentry
 * cannot type are dropped when a message is rendered, so they are translated into this shape.
 */
type MessagePart = Record<string, unknown> & { type: string };

/**
 * Translate Converse `ContentBlock`s (also used by Amazon Nova `InvokeModel` bodies) into message parts.
 *
 * Media is reported by modality only: inline media is raw bytes, which the conventions require to be
 * dropped rather than recorded. Blocks without content worth recording (`cachePoint`, redacted
 * reasoning, unknown members) are left out rather than serialized, so no binary payload slips through.
 */
function contentBlocksToParts(content: unknown): MessagePart[] {
  return Array.isArray(content) ? content.flatMap(contentBlockToParts) : [];
}

function contentBlockToParts(block: unknown): MessagePart[] {
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
    if (isObjectLike(guardContent.text) && typeof guardContent.text.text === 'string') {
      return [{ type: 'text', content: guardContent.text.text }];
    }
    return contentBlockToParts(guardContent);
  }

  if (isObjectLike(citationsContent)) {
    return contentBlocksToParts(citationsContent.content);
  }

  if (isObjectLike(block.image)) {
    const format = block.image.format;
    return [
      typeof format === 'string'
        ? { type: 'blob', modality: 'image', mime_type: `image/${format}` }
        : { type: 'blob', modality: 'image' },
    ];
  }

  for (const modality of ['video', 'audio', 'document']) {
    if (isObjectLike(block[modality])) {
      return [{ type: 'blob', modality }];
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

function converseMessagesToMessages(messages: unknown): Array<{ role: string; parts: MessagePart[] }> {
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

function systemInstructionsAttribute(parts: MessagePart[]): string | undefined {
  return parts.length ? JSON.stringify(parts) : undefined;
}

/**
 * Input attributes of a Converse-shaped request (`Converse`, `ConverseStream`, and Amazon Nova
 * `InvokeModel` bodies, which use the same `messages`/`system`/`toolConfig` shape).
 */
export function getConverseInputAttributes(input: Record<string, unknown>): Record<string, unknown> {
  const attributes: Record<string, unknown> = {};

  const systemInstructions = systemInstructionsAttribute(contentBlocksToParts(input.system));
  if (systemInstructions) {
    attributes[GEN_AI_SYSTEM_INSTRUCTIONS] = systemInstructions;
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
 * Anthropic image and document blocks carry their file inline as base64 `source.data`, which must not be
 * recorded, so they are replaced with blob parts, also inside tool results.
 */
function claudeContentWithoutMedia(content: unknown): unknown {
  return Array.isArray(content) ? content.map(claudeBlockWithoutMedia) : content;
}

function claudeBlockWithoutMedia(block: unknown): unknown {
  if (!isObjectLike(block)) {
    return block;
  }
  if (block.type === 'image' || block.type === 'document') {
    const mimeType = isObjectLike(block.source) ? block.source.media_type : undefined;
    return typeof mimeType === 'string'
      ? { type: 'blob', modality: block.type, mime_type: mimeType }
      : { type: 'blob', modality: block.type };
  }
  if (block.type === 'tool_result') {
    return { ...block, content: claudeContentWithoutMedia(block.content) };
  }
  return block;
}

/**
 * Input attributes of an Anthropic Messages `InvokeModel` body. Apart from media, the messages are
 * recorded as sent, like the Anthropic integration records the same payload, so both render alike.
 */
export function getClaudeInputAttributes(body: Record<string, unknown>): Record<string, unknown> {
  const attributes: Record<string, unknown> = {};

  const { system, messages, tools, prompt } = body;

  const systemTexts =
    typeof system === 'string'
      ? [system]
      : Array.isArray(system)
        ? system
            .map(block => (isObjectLike(block) && typeof block.text === 'string' ? block.text : undefined))
            .filter((text): text is string => !!text)
        : [];
  const systemInstructions = systemInstructionsAttribute(systemTexts.map(content => ({ type: 'text', content })));
  if (systemInstructions) {
    attributes[GEN_AI_SYSTEM_INSTRUCTIONS] = systemInstructions;
  }

  if (Array.isArray(messages) && messages.length) {
    attributes[GEN_AI_INPUT_MESSAGES] = stringify(
      messages.map(message =>
        isObjectLike(message) ? { ...message, content: claudeContentWithoutMedia(message.content) } : message,
      ),
    );
  } else if (typeof prompt === 'string') {
    // Claude 2's legacy Text Completions body.
    Object.assign(attributes, getPromptInputAttributes(prompt));
  }

  if (Array.isArray(tools) && tools.length) {
    attributes[GEN_AI_TOOL_DEFINITIONS] = JSON.stringify(tools);
  }

  return attributes;
}

/** Input attributes of the single-prompt `InvokeModel` bodies (Titan, Llama, Cohere, Mistral). */
export function getPromptInputAttributes(prompt: unknown): Record<string, unknown> {
  if (typeof prompt !== 'string') {
    return {};
  }
  return { [GEN_AI_INPUT_MESSAGES]: JSON.stringify([{ role: 'user', parts: [{ type: 'text', content: prompt }] }]) };
}
