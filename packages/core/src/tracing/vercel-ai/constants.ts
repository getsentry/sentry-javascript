import type { ToolCallSpanContext } from './types';

// Global map to track tool call IDs to their corresponding span contexts.
// This allows us to capture tool errors and link them to the correct span
// without keeping full Span objects (and their potentially large attributes) alive.
export const toolCallSpanContextMap = new Map<string, ToolCallSpanContext>();

// Used to make tool descriptions available to execute_tool spans in the span streaming path.
// Streamed spans are processed individually, so execute_tool spans cannot look up descriptions
// from their sibling doGenerate span on span end (as we do for transactions).
// Instead we store descriptions at spanStart and apply them in the processSpan hook.
// Stores parent_span_id -> Map<toolName, description>
export const toolDescriptionMap = new Map<string, Map<string, string>>();

/** Maps Vercel AI span names to standardized OpenTelemetry operation names. */
export const SPAN_TO_OPERATION_NAME = new Map<string, string>([
  ['ai.generateText', 'invoke_agent'],
  ['ai.streamText', 'invoke_agent'],
  ['ai.generateObject', 'invoke_agent'],
  ['ai.streamObject', 'invoke_agent'],
  ['ai.generateText.doGenerate', 'generate_content'],
  ['ai.streamText.doStream', 'generate_content'],
  ['ai.generateObject.doGenerate', 'generate_content'],
  ['ai.streamObject.doStream', 'generate_content'],
  ['ai.embed.doEmbed', 'embeddings'],
  ['ai.embedMany.doEmbed', 'embeddings'],
  ['ai.rerank.doRerank', 'rerank'],
  ['ai.toolCall', 'execute_tool'],
]);
