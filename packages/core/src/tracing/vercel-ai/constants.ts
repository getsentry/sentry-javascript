import type { ToolCallSpanContext } from './types';

// Global map to track tool call IDs to their corresponding span contexts.
// This allows us to capture tool errors and link them to the correct span
// without keeping full Span objects (and their potentially large attributes) alive.
export const toolCallSpanContextMap = new Map<string, ToolCallSpanContext>();

// Operation sets for efficient mapping to OpenTelemetry semantic convention values
export const INVOKE_AGENT_OPS = new Set([
  'ai.generateText',
  'ai.streamText',
  'ai.generateObject',
  'ai.streamObject',
]);

export const GENERATE_CONTENT_OPS = new Set([
  'ai.generateText.doGenerate',
  'ai.streamText.doStream',
  'ai.generateObject.doGenerate',
  'ai.streamObject.doStream',
]);

export const EMBEDDINGS_OPS = new Set(['ai.embed.doEmbed', 'ai.embedMany.doEmbed']);

export const RERANK_OPS = new Set(['ai.rerank.doRerank']);

export const DO_SPAN_NAME_PREFIX: Record<string, string> = {
  'ai.embed': 'embeddings',
  'ai.embed.doEmbed': 'embeddings',
  'ai.embedMany': 'embeddings',
  'ai.embedMany.doEmbed': 'embeddings',
  'ai.rerank': 'rerank',
  'ai.rerank.doRerank': 'rerank',
};
