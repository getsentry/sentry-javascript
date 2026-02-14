import { LRUMap } from '../../utils/lru';
import type { ToolCallSpanContext } from './types';

export const TOOL_CALL_SPAN_MAP_MAX_SIZE = 10_000;

// Global LRU map to track tool call IDs to their corresponding span contexts.
// This allows us to capture tool errors and link them to the correct span
// without keeping full Span objects (and their potentially large attributes) alive.
export const toolCallSpanMap = new LRUMap<string, ToolCallSpanContext>(TOOL_CALL_SPAN_MAP_MAX_SIZE);

// Operation sets for efficient mapping to OpenTelemetry semantic convention values
export const INVOKE_AGENT_OPS = new Set([
  'ai.generateText',
  'ai.streamText',
  'ai.generateObject',
  'ai.streamObject',
  'ai.embed',
  'ai.embedMany',
  'ai.rerank',
]);

export const GENERATE_CONTENT_OPS = new Set([
  'ai.generateText.doGenerate',
  'ai.streamText.doStream',
  'ai.generateObject.doGenerate',
  'ai.streamObject.doStream',
]);

export const EMBEDDINGS_OPS = new Set(['ai.embed.doEmbed', 'ai.embedMany.doEmbed']);

export const RERANK_OPS = new Set(['ai.rerank.doRerank']);
