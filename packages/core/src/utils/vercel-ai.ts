import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '../semanticAttributes';
import type { Span, SpanAttributes, SpanOrigin } from '../types-hoist/span';
import { spanToJSON } from './spanUtils';
import {
  AI_MODEL_ID_ATTRIBUTE,
  AI_MODEL_PROVIDER_ATTRIBUTE,
  AI_PROMPT_ATTRIBUTE,
  AI_PROMPT_MESSAGES_ATTRIBUTE,
  AI_PROMPT_TOOLS_ATTRIBUTE,
  AI_RESPONSE_TEXT_ATTRIBUTE,
  AI_RESPONSE_TOOL_CALLS_ATTRIBUTE,
  AI_TELEMETRY_FUNCTION_ID_ATTRIBUTE,
  AI_TOOL_CALL_ID_ATTRIBUTE,
  AI_TOOL_CALL_NAME_ATTRIBUTE,
  AI_USAGE_COMPLETION_TOKENS_ATTRIBUTE,
  AI_USAGE_PROMPT_TOKENS_ATTRIBUTE,
  GEN_AI_RESPONSE_MODEL_ATTRIBUTE,
  GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE,
} from './vercel-ai-attributes';

function addOriginToSpan(span: Span, origin: SpanOrigin): void {
  span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, origin);
}

/**
 * Post-process spans emitted by the Vercel AI SDK.
 * This is supposed to be used in `client.on('spanEnd', ...)`, to ensure all data is already finished.
 */
export function processVercelAiSpan(span: Span): void {
  const { data: attributes, description: name } = spanToJSON(span);

  if (!name) {
    return;
  }

  // Tool call spans
  // https://ai-sdk.dev/docs/ai-sdk-core/telemetry#tool-call-spans
  if (attributes[AI_TOOL_CALL_NAME_ATTRIBUTE] && attributes[AI_TOOL_CALL_ID_ATTRIBUTE] && name === 'ai.toolCall') {
    processToolCallSpan(span, attributes);
    sharedProcessSpan(span, attributes);
    return;
  }

  // The AI and Provider must be defined for generate, stream, and embed spans.
  // The id of the model
  const aiModelId = attributes[AI_MODEL_ID_ATTRIBUTE];
  // the provider of the model
  const aiModelProvider = attributes[AI_MODEL_PROVIDER_ATTRIBUTE];
  if (typeof aiModelId !== 'string' || typeof aiModelProvider !== 'string' || !aiModelId || !aiModelProvider) {
    return;
  }

  processGenerateSpan(span, name, attributes);
  sharedProcessSpan(span, attributes);
}

/**
 * Renames an attribute key in the provided attributes object if the old key exists.
 * This function safely handles null and undefined values.
 */
function renameAttributeKey(attributes: Record<string, unknown>, oldKey: string, newKey: string): void {
  if (attributes[oldKey] != null) {
    attributes[newKey] = attributes[oldKey];
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete attributes[oldKey];
  }
}

function processToolCallSpan(span: Span, attributes: SpanAttributes): void {
  addOriginToSpan(span, 'auto.vercelai.otel');
  span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'gen_ai.execute_tool');
  span.setAttribute('gen_ai.tool.call.id', attributes[AI_TOOL_CALL_ID_ATTRIBUTE]);
  span.setAttribute('gen_ai.tool.name', attributes[AI_TOOL_CALL_NAME_ATTRIBUTE]);
  span.updateName(`execute_tool ${attributes[AI_TOOL_CALL_NAME_ATTRIBUTE]}`);
}

function processGenerateSpan(span: Span, name: string, attributes: SpanAttributes): void {
  addOriginToSpan(span, 'auto.vercelai.otel');

  const nameWthoutAi = name.replace('ai.', '');
  span.setAttribute('ai.pipeline.name', nameWthoutAi);
  span.updateName(nameWthoutAi);

  // If a Telemetry name is set and it is a pipeline span, use that as the operation name
  const functionId = attributes[AI_TELEMETRY_FUNCTION_ID_ATTRIBUTE];
  if (functionId && typeof functionId === 'string' && name.split('.').length - 1 === 1) {
    span.updateName(`${nameWthoutAi} ${functionId}`);
    span.setAttribute('ai.pipeline.name', functionId);
  }

  if (attributes[AI_PROMPT_ATTRIBUTE]) {
    span.setAttribute('gen_ai.prompt', attributes[AI_PROMPT_ATTRIBUTE]);
  }
  if (attributes[AI_MODEL_ID_ATTRIBUTE] && !attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE]) {
    span.setAttribute(GEN_AI_RESPONSE_MODEL_ATTRIBUTE, attributes[AI_MODEL_ID_ATTRIBUTE]);
  }
  span.setAttribute('ai.streaming', name.includes('stream'));

  // Generate Spans
  if (name === 'ai.generateText') {
    span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'gen_ai.invoke_agent');
    return;
  }

  if (name === 'ai.generateText.doGenerate') {
    span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'gen_ai.generate_text');
    span.updateName(`generate_text ${attributes[AI_MODEL_ID_ATTRIBUTE]}`);
    return;
  }

  if (name === 'ai.streamText') {
    span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'gen_ai.invoke_agent');
    return;
  }

  if (name === 'ai.streamText.doStream') {
    span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'gen_ai.stream_text');
    span.updateName(`stream_text ${attributes[AI_MODEL_ID_ATTRIBUTE]}`);
    return;
  }

  if (name === 'ai.generateObject') {
    span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'gen_ai.invoke_agent');
    return;
  }

  if (name === 'ai.generateObject.doGenerate') {
    span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'gen_ai.generate_object');
    span.updateName(`generate_object ${attributes[AI_MODEL_ID_ATTRIBUTE]}`);
    return;
  }

  if (name === 'ai.streamObject') {
    span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'gen_ai.invoke_agent');
    return;
  }

  if (name === 'ai.streamObject.doStream') {
    span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'gen_ai.stream_object');
    span.updateName(`stream_object ${attributes[AI_MODEL_ID_ATTRIBUTE]}`);
    return;
  }

  if (name === 'ai.embed') {
    span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'gen_ai.invoke_agent');
    return;
  }

  if (name === 'ai.embed.doEmbed') {
    span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'gen_ai.embed');
    span.updateName(`embed ${attributes[AI_MODEL_ID_ATTRIBUTE]}`);
    return;
  }

  if (name === 'ai.embedMany') {
    span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'gen_ai.invoke_agent');
    return;
  }

  if (name === 'ai.embedMany.doEmbed') {
    span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'gen_ai.embed_many');
    span.updateName(`embed_many ${attributes[AI_MODEL_ID_ATTRIBUTE]}`);
    return;
  }

  if (name.startsWith('ai.stream')) {
    span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'ai.run');
    return;
  }
}

// Processing for both tool call and non-tool call spans
function sharedProcessSpan(span: Span, attributes: SpanAttributes): void {
  renameAttributeKey(attributes, AI_USAGE_COMPLETION_TOKENS_ATTRIBUTE, GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE);
  renameAttributeKey(attributes, AI_USAGE_PROMPT_TOKENS_ATTRIBUTE, GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE);

  if (
    typeof attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE] === 'number' &&
    typeof attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE] === 'number'
  ) {
    attributes['gen_ai.usage.total_tokens'] =
      attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE] + attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE];
  }

  // Rename AI SDK attributes to standardized gen_ai attributes
  renameAttributeKey(attributes, AI_PROMPT_MESSAGES_ATTRIBUTE, 'gen_ai.request.messages');
  renameAttributeKey(attributes, AI_RESPONSE_TEXT_ATTRIBUTE, 'gen_ai.response.text');
  renameAttributeKey(attributes, AI_RESPONSE_TOOL_CALLS_ATTRIBUTE, 'gen_ai.response.tool_calls');
  renameAttributeKey(attributes, AI_PROMPT_TOOLS_ATTRIBUTE, 'gen_ai.request.available_tools');
}
