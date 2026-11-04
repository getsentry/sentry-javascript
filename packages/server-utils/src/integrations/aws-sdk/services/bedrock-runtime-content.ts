/* eslint-disable typescript-eslint/no-deprecated */
import type { Span } from '@sentry/core';
import { isObjectLike, SPAN_STATUS_ERROR, stringify } from '@sentry/core';
import {
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OUTPUT_MESSAGES,
  GEN_AI_RESPONSE_TEXT,
  GEN_AI_RESPONSE_TOOL_CALLS,
  GEN_AI_SYSTEM_INSTRUCTIONS,
  GEN_AI_TOOL_DEFINITIONS,
} from '@sentry/conventions/attributes';
import type { StreamResponseState } from '../../../ai/core/utils';
import { endStreamSpan } from '../../../ai/core/utils';

/**
 * A message part as described in https://develop.sentry.dev/sdk/telemetry/traces/modules/ai-agents/.
 * Bedrock's own content blocks (`{ text }`, `{ toolUse }`, ...) carry no `type`, and parts Sentry
 * cannot type are dropped when a message is rendered, so they are translated into this shape.
 */
type MessagePart = Record<string, unknown> & { type: string };

/** An output block of the assistant turn, in the order the model produced it. */
type OutputBlock =
  | { type: 'text' | 'reasoning'; content: string }
  | { type: 'tool_call'; id: unknown; name: unknown; input: unknown };

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

function systemInstructionsAttribute(textParts: MessagePart[]): string | undefined {
  return textParts.length ? JSON.stringify(textParts) : undefined;
}

/**
 * Input attributes of a Converse-shaped request (`Converse`, `ConverseStream`, and Amazon Nova
 * `InvokeModel` bodies, which use the same `messages`/`system`/`toolConfig` shape).
 */
export function getConverseInputAttributes(input: Record<string, unknown>): Record<string, unknown> {
  const attributes: Record<string, unknown> = {};

  const systemInstructions = systemInstructionsAttribute(
    contentBlocksToParts(input.system).filter(part => part.type === 'text'),
  );
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
 * Input attributes of an Anthropic Messages `InvokeModel` body. The messages are recorded as sent, like
 * the Anthropic integration records the same payload, so both render alike.
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
    attributes[GEN_AI_INPUT_MESSAGES] = stringify(messages);
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
  if (typeof prompt !== 'string' || !prompt) {
    return {};
  }
  return { [GEN_AI_INPUT_MESSAGES]: JSON.stringify([{ role: 'user', parts: [{ type: 'text', content: prompt }] }]) };
}

/** The output blocks of a Converse-shaped response message (`Converse`, Amazon Nova `InvokeModel`). */
export function getConverseOutputBlocks(message: unknown): OutputBlock[] {
  if (!isObjectLike(message) || !Array.isArray(message.content)) {
    return [];
  }

  return message.content.flatMap((block): OutputBlock[] => {
    if (isObjectLike(block) && isObjectLike(block.toolUse)) {
      return [{ type: 'tool_call', id: block.toolUse.toolUseId, name: block.toolUse.name, input: block.toolUse.input }];
    }
    return contentBlockToParts(block).flatMap((part): OutputBlock[] =>
      (part.type === 'text' || part.type === 'reasoning') && typeof part.content === 'string'
        ? [{ type: part.type, content: part.content }]
        : [],
    );
  });
}

/** The output blocks of an Anthropic Messages response body. */
export function getClaudeOutputBlocks(content: unknown): OutputBlock[] {
  if (!Array.isArray(content)) {
    return [];
  }

  return content.flatMap((block): OutputBlock[] => {
    if (!isObjectLike(block)) {
      return [];
    }
    if (block.type === 'text' && typeof block.text === 'string') {
      return [{ type: 'text', content: block.text }];
    }
    if (block.type === 'thinking' && typeof block.thinking === 'string') {
      return [{ type: 'reasoning', content: block.thinking }];
    }
    if (block.type === 'tool_use' || block.type === 'server_tool_use') {
      return [{ type: 'tool_call', id: block.id, name: block.name, input: block.input }];
    }
    return [];
  });
}

export function textOutputBlocks(text: unknown): OutputBlock[] {
  return typeof text === 'string' && text ? [{ type: 'text', content: text }] : [];
}

function splitOutputBlocks(blocks: OutputBlock[]): {
  parts: MessagePart[];
  responseTexts: string[];
  toolCalls: Array<Record<string, unknown>>;
} {
  const parts: MessagePart[] = [];
  const responseTexts: string[] = [];
  const toolCalls: Array<Record<string, unknown>> = [];

  for (const block of blocks) {
    if (block.type === 'tool_call') {
      parts.push({
        type: 'tool_call',
        id: block.id,
        name: block.name,
        arguments: stringify(block.input ?? {}, String),
      });
      toolCalls.push({ id: block.id, name: block.name, arguments: block.input ?? {} });
    } else {
      parts.push({ type: block.type, content: block.content });
      if (block.type === 'text') {
        responseTexts.push(block.content);
      }
    }
  }

  return { parts, responseTexts, toolCalls };
}

function setOutputMessages(span: Span, parts: MessagePart[], finishReason: string | undefined): void {
  if (parts.length) {
    span.setAttribute(
      GEN_AI_OUTPUT_MESSAGES,
      JSON.stringify([
        finishReason ? { role: 'assistant', parts, finish_reason: finishReason } : { role: 'assistant', parts },
      ]),
    );
  }
}

/**
 * Record the assistant turn of a non-streamed response. Sets `gen_ai.output.messages`, which the product
 * reads first, alongside the deprecated `gen_ai.response.text`/`gen_ai.response.tool_calls` that
 * `endStreamSpan` writes for streamed responses, so both paths emit the same attributes.
 */
export function setOutputAttributes(span: Span, blocks: OutputBlock[], finishReason: string | undefined): void {
  const { parts, responseTexts, toolCalls } = splitOutputBlocks(blocks);

  setOutputMessages(span, parts, finishReason);
  if (responseTexts.length) {
    span.setAttribute(GEN_AI_RESPONSE_TEXT, responseTexts.join(''));
  }
  if (toolCalls.length) {
    span.setAttribute(GEN_AI_RESPONSE_TOOL_CALLS, JSON.stringify(toolCalls));
  }
}

interface StreamBlock {
  type: 'text' | 'reasoning' | 'tool_call';
  content: string;
  id?: unknown;
  name?: unknown;
}

/** Accumulates a streamed response. Content blocks are keyed by their index in the assistant message. */
export interface BedrockStreamState extends Omit<StreamResponseState, 'responseTexts' | 'toolCalls'> {
  blocks: Map<number, StreamBlock>;
}

function createStreamState(): BedrockStreamState {
  return { finishReasons: [], blocks: new Map() };
}

/** Append streamed content to the block at `index`, opening it with `type` if it is new. */
export function appendStreamBlock(
  state: BedrockStreamState,
  index: unknown,
  type: StreamBlock['type'],
  content: unknown,
): void {
  const key = typeof index === 'number' ? index : 0;
  let block = state.blocks.get(key);
  if (!block) {
    block = { type, content: '' };
    state.blocks.set(key, block);
  }
  if (typeof content === 'string') {
    block.content += content;
  }
}

/** Open a tool-call block, whose arguments then stream in as JSON fragments. */
export function startStreamToolCall(state: BedrockStreamState, index: unknown, id: unknown, name: unknown): void {
  state.blocks.set(typeof index === 'number' ? index : 0, { type: 'tool_call', content: '', id, name });
}

function streamBlocksToOutputBlocks(state: BedrockStreamState): OutputBlock[] {
  return [...state.blocks.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, block]): OutputBlock => {
      if (block.type !== 'tool_call') {
        return { type: block.type, content: block.content };
      }
      let input: unknown = {};
      if (block.content) {
        try {
          input = JSON.parse(block.content);
        } catch {
          input = block.content;
        }
      }
      return { type: 'tool_call', id: block.id, name: block.name, input };
    })
    .filter(block => block.type === 'tool_call' || block.content.length > 0);
}

/**
 * Wrap a response stream so the span collects the response while the caller consumes it, and ends once
 * the stream is drained, closed early, or fails. The caller receives every item unchanged.
 */
export async function* instrumentBedrockStream<T>(
  stream: AsyncIterable<T>,
  span: Span,
  recordOutputs: boolean,
  processItem: (item: T, state: BedrockStreamState) => void,
): AsyncGenerator<T> {
  const state = createStreamState();
  try {
    for await (const item of stream) {
      try {
        processItem(item, state);
      } catch {
        // A chunk we fail to read must not break the caller's stream.
      }
      yield item;
    }
  } catch (error) {
    span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
    throw error;
  } finally {
    const { parts, responseTexts, toolCalls } = splitOutputBlocks(streamBlocksToOutputBlocks(state));
    if (recordOutputs) {
      setOutputMessages(span, parts, state.finishReasons[0]);
    }
    endStreamSpan(span, { ...state, responseTexts, toolCalls }, recordOutputs);
  }
}
