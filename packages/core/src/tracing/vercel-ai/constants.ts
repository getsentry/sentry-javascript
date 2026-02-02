import type { Span } from '../../types-hoist/span';

// Global Map to track tool call IDs to their corresponding spans
// This allows us to capture tool errors and link them to the correct span
export const toolCallSpanMap = new Map<string, Span>();

// Operation sets for efficient mapping to OpenTelemetry semantic convention values
export const INVOKE_AGENT_OPS = new Set([
  'ai.generateText',
  'ai.streamText',
  'ai.generateObject',
  'ai.streamObject',
  'ai.embed',
  'ai.embedMany',
]);

export const GENERATE_CONTENT_OPS = new Set([
  'ai.generateText.doGenerate',
  'ai.streamText.doStream',
  'ai.generateObject.doGenerate',
  'ai.streamObject.doStream',
]);

export const EMBEDDINGS_OPS = new Set(['ai.embed.doEmbed', 'ai.embedMany.doEmbed']);
