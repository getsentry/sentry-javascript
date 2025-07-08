import type { Client } from '../client';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '../semanticAttributes';
import type { Event } from '../types-hoist/event';
import type { Span, SpanAttributes, SpanJSON, SpanOrigin } from '../types-hoist/span';
import { spanToJSON } from './spanUtils';
import {
  AI_EMBEDDING_ATTRIBUTE,
  AI_EMBEDDINGS_ATTRIBUTE,
  AI_MODEL_ID_ATTRIBUTE,
  AI_MODEL_PROVIDER_ATTRIBUTE,
  AI_OPERATION_ID_ATTRIBUTE,
  AI_PIPELINE_NAME_ATTRIBUTE,
  AI_PROMPT_ATTRIBUTE,
  AI_PROMPT_FORMAT_ATTRIBUTE,
  AI_PROMPT_MESSAGES_ATTRIBUTE,
  AI_PROMPT_TOOL_CHOICE_ATTRIBUTE,
  AI_PROMPT_TOOLS_ATTRIBUTE,
  AI_REQUEST_HEADERS_ATTRIBUTE,
  AI_RESPONSE_AVG_COMPLETION_TOKENS_PER_SECOND_ATTRIBUTE,
  AI_RESPONSE_FINISH_REASON_ATTRIBUTE,
  AI_RESPONSE_ID_ATTRIBUTE,
  AI_RESPONSE_MODEL_ATTRIBUTE,
  AI_RESPONSE_MS_TO_FINISH_ATTRIBUTE,
  AI_RESPONSE_MS_TO_FIRST_CHUNK_ATTRIBUTE,
  AI_RESPONSE_OBJECT_ATTRIBUTE,
  AI_RESPONSE_TEXT_ATTRIBUTE,
  AI_RESPONSE_TIMESTAMP_ATTRIBUTE,
  AI_RESPONSE_TOOL_CALLS_ATTRIBUTE,
  AI_SCHEMA_ATTRIBUTE,
  AI_SCHEMA_DESCRIPTION_ATTRIBUTE,
  AI_SCHEMA_NAME_ATTRIBUTE,
  AI_SETTINGS_MAX_RETRIES_ATTRIBUTE,
  AI_SETTINGS_MAX_STEPS_ATTRIBUTE,
  AI_SETTINGS_MODE_ATTRIBUTE,
  AI_SETTINGS_OUTPUT_ATTRIBUTE,
  AI_STREAMING_ATTRIBUTE,
  AI_TELEMETRY_FUNCTION_ID_ATTRIBUTE,
  AI_TELEMETRY_METADATA_ATTRIBUTE,
  AI_TOOL_CALL_ARGS_ATTRIBUTE,
  AI_TOOL_CALL_ID_ATTRIBUTE,
  AI_TOOL_CALL_NAME_ATTRIBUTE,
  AI_TOOL_CALL_RESULT_ATTRIBUTE,
  AI_USAGE_COMPLETION_TOKENS_ATTRIBUTE,
  AI_USAGE_PROMPT_TOKENS_ATTRIBUTE,
  AI_USAGE_TOKENS_ATTRIBUTE,
  AI_VALUE_ATTRIBUTE,
  AI_VALUES_ATTRIBUTE,
  GEN_AI_RESPONSE_MODEL_ATTRIBUTE,
  GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE,
} from './vercel-ai-attributes';

function addOriginToSpan(span: Span, origin: SpanOrigin): void {
  span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, origin);
}

/**
 * Post-process spans emitted by the Vercel AI SDK.
 * This is supposed to be used in `client.on('spanStart', ...)
 */
function onVercelAiSpanStart(span: Span): void {
  const { data: attributes, description: name } = spanToJSON(span);

  if (!name) {
    return;
  }

  // Tool call spans
  // https://ai-sdk.dev/docs/ai-sdk-core/telemetry#tool-call-spans
  if (attributes['ai.toolCall.name'] && attributes['ai.toolCall.id'] && name === 'ai.toolCall') {
    processToolCallSpan(span, attributes);
    return;
  }

  // The AI and Provider must be defined for generate, stream, and embed spans.
  // The id of the model
  const aiModelId = attributes['ai.model.id'];
  // the provider of the model
  const aiModelProvider = attributes['ai.model.provider'];
  if (typeof aiModelId !== 'string' || typeof aiModelProvider !== 'string' || !aiModelId || !aiModelProvider) {
    return;
  }

  processGenerateSpan(span, name, attributes);
}

const vercelAiEventProcessor = Object.assign(
  (event: Event): Event => {
    if (event.type === 'transaction' && event.spans) {
      for (const span of event.spans) {
        // this mutates spans in-place
        processEndedVercelAiSpan(span);
      }
    }
    return event;
  },
  { id: 'VercelAiEventProcessor' },
);

/**
 * Post-process spans emitted by the Vercel AI SDK.
 */
function processEndedVercelAiSpan(span: SpanJSON): void {
  const { data: attributes, origin } = span;

  if (origin !== 'auto.vercelai.otel') {
    return;
  }

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

  renameAttributeKey(attributes, AI_TOOL_CALL_ARGS_ATTRIBUTE, 'gen_ai.tool.input');
  renameAttributeKey(attributes, AI_TOOL_CALL_RESULT_ATTRIBUTE, 'gen_ai.tool.output');
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
  renameAttributeKey(attributes, 'ai.toolCall.name', 'gen_ai.tool.name');
  renameAttributeKey(attributes, 'ai.toolCall.id', 'gen_ai.tool.call.id');
  // https://opentelemetry.io/docs/specs/semconv/registry/attributes/gen-ai/#gen-ai-tool-type
  if (!attributes['gen_ai.tool.type']) {
    span.setAttribute('gen_ai.tool.type', 'function');
  }
  const toolName = attributes['gen_ai.tool.name'];
  if (toolName) {
    span.updateName(`execute_tool ${toolName}`);
  }
}

function processGenerateSpan(span: Span, name: string, attributes: SpanAttributes): void {
  addOriginToSpan(span, 'auto.vercelai.otel');

  // First, rename all the ai.* attributes to vercel.ai.* attributes
  renameAttributeKey(attributes, 'ai.model.id', AI_MODEL_ID_ATTRIBUTE);
  renameAttributeKey(attributes, 'ai.model.provider', AI_MODEL_PROVIDER_ATTRIBUTE);
  renameAttributeKey(attributes, 'ai.operationId', AI_OPERATION_ID_ATTRIBUTE);
  renameAttributeKey(attributes, 'ai.prompt', AI_PROMPT_ATTRIBUTE);
  renameAttributeKey(attributes, 'ai.schema', AI_SCHEMA_ATTRIBUTE);
  renameAttributeKey(attributes, 'ai.schema.name', AI_SCHEMA_NAME_ATTRIBUTE);
  renameAttributeKey(attributes, 'ai.schema.description', AI_SCHEMA_DESCRIPTION_ATTRIBUTE);
  renameAttributeKey(attributes, 'ai.response.object', AI_RESPONSE_OBJECT_ATTRIBUTE);
  renameAttributeKey(attributes, 'ai.settings.mode', AI_SETTINGS_MODE_ATTRIBUTE);
  renameAttributeKey(attributes, 'ai.settings.output', AI_SETTINGS_OUTPUT_ATTRIBUTE);
  renameAttributeKey(attributes, 'ai.values', AI_VALUES_ATTRIBUTE);
  renameAttributeKey(attributes, 'ai.embeddings', AI_EMBEDDINGS_ATTRIBUTE);
  renameAttributeKey(attributes, 'ai.response.text', AI_RESPONSE_TEXT_ATTRIBUTE);
  renameAttributeKey(attributes, 'ai.response.toolCalls', AI_RESPONSE_TOOL_CALLS_ATTRIBUTE);
  renameAttributeKey(attributes, 'ai.response.finishReason', AI_RESPONSE_FINISH_REASON_ATTRIBUTE);
  renameAttributeKey(attributes, 'ai.settings.maxSteps', AI_SETTINGS_MAX_STEPS_ATTRIBUTE);
  renameAttributeKey(attributes, 'ai.prompt.format', AI_PROMPT_FORMAT_ATTRIBUTE);
  renameAttributeKey(attributes, 'ai.prompt.messages', AI_PROMPT_MESSAGES_ATTRIBUTE);
  renameAttributeKey(attributes, 'ai.prompt.tools', AI_PROMPT_TOOLS_ATTRIBUTE);
  renameAttributeKey(attributes, 'ai.prompt.toolChoice', AI_PROMPT_TOOL_CHOICE_ATTRIBUTE);
  renameAttributeKey(attributes, 'ai.response.msToFirstChunk', AI_RESPONSE_MS_TO_FIRST_CHUNK_ATTRIBUTE);
  renameAttributeKey(attributes, 'ai.response.msToFinish', AI_RESPONSE_MS_TO_FINISH_ATTRIBUTE);
  renameAttributeKey(attributes, 'ai.response.avgCompletionTokensPerSecond', AI_RESPONSE_AVG_COMPLETION_TOKENS_PER_SECOND_ATTRIBUTE);
  renameAttributeKey(attributes, 'ai.value', AI_VALUE_ATTRIBUTE);
  renameAttributeKey(attributes, 'ai.embedding', AI_EMBEDDING_ATTRIBUTE);
  renameAttributeKey(attributes, 'ai.request.headers', AI_REQUEST_HEADERS_ATTRIBUTE);
  renameAttributeKey(attributes, 'ai.settings.maxRetries', AI_SETTINGS_MAX_RETRIES_ATTRIBUTE);
  renameAttributeKey(attributes, 'ai.telemetry.functionId', AI_TELEMETRY_FUNCTION_ID_ATTRIBUTE);
  renameAttributeKey(attributes, 'ai.telemetry.metadata', AI_TELEMETRY_METADATA_ATTRIBUTE);
  renameAttributeKey(attributes, 'ai.usage.completionTokens', AI_USAGE_COMPLETION_TOKENS_ATTRIBUTE);
  renameAttributeKey(attributes, 'ai.usage.promptTokens', AI_USAGE_PROMPT_TOKENS_ATTRIBUTE);
  renameAttributeKey(attributes, 'ai.response.model', AI_RESPONSE_MODEL_ATTRIBUTE);
  renameAttributeKey(attributes, 'ai.response.id', AI_RESPONSE_ID_ATTRIBUTE);
  renameAttributeKey(attributes, 'ai.response.timestamp', AI_RESPONSE_TIMESTAMP_ATTRIBUTE);
  renameAttributeKey(attributes, 'ai.usage.tokens', AI_USAGE_TOKENS_ATTRIBUTE);
  renameAttributeKey(attributes, 'ai.toolCall.args', AI_TOOL_CALL_ARGS_ATTRIBUTE);
  renameAttributeKey(attributes, 'ai.toolCall.result', AI_TOOL_CALL_RESULT_ATTRIBUTE);

  const nameWthoutAi = name.replace('ai.', '');
  span.setAttribute(AI_PIPELINE_NAME_ATTRIBUTE, nameWthoutAi);
  span.updateName(nameWthoutAi);

  // If a Telemetry name is set and it is a pipeline span, use that as the operation name
  const functionId = attributes[AI_TELEMETRY_FUNCTION_ID_ATTRIBUTE];
  if (functionId && typeof functionId === 'string' && name.split('.').length - 1 === 1) {
    span.updateName(`${nameWthoutAi} ${functionId}`);
    span.setAttribute('gen_ai.function_id', functionId);
  }

  if (attributes[AI_PROMPT_ATTRIBUTE]) {
    span.setAttribute('gen_ai.prompt', attributes[AI_PROMPT_ATTRIBUTE]);
  }
  if (attributes[AI_MODEL_ID_ATTRIBUTE] && !attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE]) {
    span.setAttribute(GEN_AI_RESPONSE_MODEL_ATTRIBUTE, attributes[AI_MODEL_ID_ATTRIBUTE]);
  }
  span.setAttribute(AI_STREAMING_ATTRIBUTE, name.includes('stream'));

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

/**
 * Add event processors to the given client to process Vercel AI spans.
 */
export function addVercelAiProcessors(client: Client): void {
  client.on('spanStart', onVercelAiSpanStart);
  // Note: We cannot do this on `spanEnd`, because the span cannot be mutated anymore at this point
  client.addEventProcessor(vercelAiEventProcessor);
}
