import type { Client } from '../client';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '../semanticAttributes';
import type { Event } from '../types-hoist/event';
import type { Span, SpanAttributes, SpanJSON, SpanOrigin } from '../types-hoist/span';
import { spanToJSON } from './spanUtils';
import {
  AI_MODEL_ID_ATTRIBUTE,
  AI_MODEL_PROVIDER_ATTRIBUTE,
  AI_TOOL_CALL_ID_ATTRIBUTE,
  AI_TOOL_CALL_NAME_ATTRIBUTE,
  GEN_AI_RESPONSE_MODEL_ATTRIBUTE,
  GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE,
} from './vercel-ai-attributes';

function addOriginToSpan(span: Span, origin: SpanOrigin): void {
  span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, origin);
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

/**
 * Renames all attributes with 'ai.' prefix to 'vercel.ai.' prefix
 */
function renameAiAttributesToVercelAi(attributes: SpanAttributes): void {
  const keysToRename = Object.keys(attributes).filter(key => key.startsWith('ai.'));

  for (const oldKey of keysToRename) {
    const newKey = oldKey.replace(/^ai\./, 'vercel.ai.');
    renameAttributeKey(attributes, oldKey, newKey);
  }
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
  if (attributes[AI_TOOL_CALL_NAME_ATTRIBUTE] && attributes[AI_TOOL_CALL_ID_ATTRIBUTE] && name === 'ai.toolCall') {
    processToolCallSpan(span, attributes);
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
  const { data: attributes, origin, description: name } = span;

  // Check if this is a Vercel AI span (either manual or OpenTelemetry)
  const isVercelAiSpan = origin === 'auto.vercelai.otel' ||
    (origin === 'manual' && name && name.startsWith('ai.'));

  if (!isVercelAiSpan) {
    return;
  }

  // If it's a manual span, we need to process it like we would in onVercelAiSpanStart
  if (origin === 'manual' && name && name.startsWith('ai.')) {
    // Rename all ai.* attributes to vercel.ai.* attributes
    renameAiAttributesToVercelAi(attributes);

    // Set the origin to indicate it was processed by our integration
    span.origin = 'auto.vercelai.otel';

    // Tool call spans
    if (attributes['vercel.ai.toolCall.name'] && attributes['vercel.ai.toolCall.id'] && name === 'ai.toolCall') {
      processToolCallSpanAttributes(attributes);
      span.description = `execute_tool ${attributes['gen_ai.tool.name']}`;
      span.op = 'gen_ai.execute_tool';
      return;
    }

    // The AI and Provider must be defined for generate, stream, and embed spans.
    const aiModelId = attributes['vercel.ai.model.id'];
    const aiModelProvider = attributes['vercel.ai.model.provider'];
    if (typeof aiModelId === 'string' && typeof aiModelProvider === 'string' && aiModelId && aiModelProvider) {
      processGenerateSpanAttributes(span, name, attributes);
    }
  }

  // Update operation.name and operationId values to use vercel.ai.* prefix for all Vercel AI spans
  if (attributes['operation.name'] && typeof attributes['operation.name'] === 'string') {
    const operationName = attributes['operation.name'] as string;
    if (operationName.startsWith('ai.')) {
      attributes['operation.name'] = operationName.replace(/^ai\./, 'vercel.ai.');
    }
  }

  if (attributes['vercel.ai.operationId'] && typeof attributes['vercel.ai.operationId'] === 'string') {
    const operationId = attributes['vercel.ai.operationId'] as string;
    if (operationId.startsWith('ai.')) {
      attributes['vercel.ai.operationId'] = operationId.replace(/^ai\./, 'vercel.ai.');
    }
  }

  // Process the renamed attributes for both manual and OpenTelemetry spans
  renameAttributeKey(attributes, 'vercel.ai.usage.completionTokens', GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE);
  renameAttributeKey(attributes, 'vercel.ai.usage.promptTokens', GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE);

  if (
    typeof attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE] === 'number' &&
    typeof attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE] === 'number'
  ) {
    attributes['gen_ai.usage.total_tokens'] =
      attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE] + attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE];
  }

  // Rename AI SDK attributes to standardized gen_ai attributes
  renameAttributeKey(attributes, 'vercel.ai.prompt.messages', 'gen_ai.request.messages');
  renameAttributeKey(attributes, 'vercel.ai.response.text', 'gen_ai.response.text');
  renameAttributeKey(attributes, 'vercel.ai.response.toolCalls', 'gen_ai.response.tool_calls');
  renameAttributeKey(attributes, 'vercel.ai.prompt.tools', 'gen_ai.request.available_tools');

  renameAttributeKey(attributes, 'vercel.ai.toolCall.args', 'gen_ai.tool.input');
  renameAttributeKey(attributes, 'vercel.ai.toolCall.result', 'gen_ai.tool.output');
}

function processToolCallSpan(span: Span, attributes: SpanAttributes): void {
  addOriginToSpan(span, 'auto.vercelai.otel');
  span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'gen_ai.execute_tool');

  // Rename all ai.* attributes to vercel.ai.* attributes
  renameAiAttributesToVercelAi(attributes);

  processToolCallSpanAttributes(attributes);

  const toolName = attributes['gen_ai.tool.name'];
  if (toolName) {
    span.updateName(`execute_tool ${toolName}`);
  }
}

function processToolCallSpanAttributes(attributes: SpanAttributes): void {
  renameAttributeKey(attributes, 'vercel.ai.toolCall.name', 'gen_ai.tool.name');
  renameAttributeKey(attributes, 'vercel.ai.toolCall.id', 'gen_ai.tool.call.id');
  // https://opentelemetry.io/docs/specs/semconv/registry/attributes/gen-ai/#gen-ai-tool-type
  if (!attributes['gen_ai.tool.type']) {
    attributes['gen_ai.tool.type'] = 'function';
  }
}

function processGenerateSpan(span: Span, name: string, attributes: SpanAttributes): void {
  addOriginToSpan(span, 'auto.vercelai.otel');

  // Rename all ai.* attributes to vercel.ai.* attributes
  renameAiAttributesToVercelAi(attributes);

  const nameWthoutAi = name.replace('ai.', '');
  span.setAttribute('vercel.ai.pipeline.name', nameWthoutAi);
  span.updateName(nameWthoutAi);

  // If a Telemetry name is set and it is a pipeline span, use that as the operation name
  const functionId = attributes['vercel.ai.telemetry.functionId'];
  if (functionId && typeof functionId === 'string' && name.split('.').length - 1 === 1) {
    span.updateName(`${nameWthoutAi} ${functionId}`);
    span.setAttribute('gen_ai.function_id', functionId);
  }

  if (attributes['vercel.ai.prompt']) {
    span.setAttribute('gen_ai.prompt', attributes['vercel.ai.prompt']);
  }
  if (attributes['vercel.ai.model.id'] && !attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE]) {
    span.setAttribute(GEN_AI_RESPONSE_MODEL_ATTRIBUTE, attributes['vercel.ai.model.id']);
  }
  span.setAttribute('vercel.ai.streaming', name.includes('stream'));

  // Generate Spans
  if (name === 'ai.generateText') {
    span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'gen_ai.invoke_agent');
    return;
  }

  if (name === 'ai.generateText.doGenerate') {
    span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'gen_ai.generate_text');
    span.updateName(`generate_text ${attributes['vercel.ai.model.id']}`);
    return;
  }

  if (name === 'ai.streamText') {
    span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'gen_ai.invoke_agent');
    return;
  }

  if (name === 'ai.streamText.doStream') {
    span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'gen_ai.stream_text');
    span.updateName(`stream_text ${attributes['vercel.ai.model.id']}`);
    return;
  }

  if (name === 'ai.generateObject') {
    span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'gen_ai.invoke_agent');
    return;
  }

  if (name === 'ai.generateObject.doGenerate') {
    span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'gen_ai.generate_object');
    span.updateName(`generate_object ${attributes['vercel.ai.model.id']}`);
    return;
  }

  if (name === 'ai.streamObject') {
    span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'gen_ai.invoke_agent');
    return;
  }

  if (name === 'ai.streamObject.doStream') {
    span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'gen_ai.stream_object');
    span.updateName(`stream_object ${attributes['vercel.ai.model.id']}`);
    return;
  }

  if (name === 'ai.embed') {
    span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'gen_ai.invoke_agent');
    return;
  }

  if (name === 'ai.embed.doEmbed') {
    span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'gen_ai.embed');
    span.updateName(`embed ${attributes['vercel.ai.model.id']}`);
    return;
  }

  if (name === 'ai.embedMany') {
    span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'gen_ai.invoke_agent');
    return;
  }

  if (name === 'ai.embedMany.doEmbed') {
    span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'gen_ai.embed_many');
    span.updateName(`embed_many ${attributes['vercel.ai.model.id']}`);
    return;
  }

  if (name.startsWith('ai.stream')) {
    span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'ai.run');
    return;
  }
}

function processGenerateSpanAttributes(span: SpanJSON, name: string, attributes: SpanAttributes): void {
  const nameWthoutAi = name.replace('ai.', '');
  attributes['vercel.ai.pipeline.name'] = nameWthoutAi;
  span.description = nameWthoutAi;

  // If a Telemetry name is set and it is a pipeline span, use that as the operation name
  const functionId = attributes['vercel.ai.telemetry.functionId'];
  if (functionId && typeof functionId === 'string' && name.split('.').length - 1 === 1) {
    span.description = `${nameWthoutAi} ${functionId}`;
    attributes['gen_ai.function_id'] = functionId;
  }

  if (attributes['vercel.ai.prompt']) {
    attributes['gen_ai.prompt'] = attributes['vercel.ai.prompt'];
  }
  if (attributes['vercel.ai.model.id'] && !attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE]) {
    attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE] = attributes['vercel.ai.model.id'];
  }
  attributes['vercel.ai.streaming'] = name.includes('stream');

  // Generate Spans
  if (name === 'ai.generateText') {
    span.op = 'gen_ai.invoke_agent';
    return;
  }

  if (name === 'ai.generateText.doGenerate') {
    span.op = 'gen_ai.generate_text';
    span.description = `generate_text ${attributes['vercel.ai.model.id']}`;
    return;
  }

  if (name === 'ai.streamText') {
    span.op = 'gen_ai.invoke_agent';
    return;
  }

  if (name === 'ai.streamText.doStream') {
    span.op = 'gen_ai.stream_text';
    span.description = `stream_text ${attributes['vercel.ai.model.id']}`;
    return;
  }

  if (name === 'ai.generateObject') {
    span.op = 'gen_ai.invoke_agent';
    return;
  }

  if (name === 'ai.generateObject.doGenerate') {
    span.op = 'gen_ai.generate_object';
    span.description = `generate_object ${attributes['vercel.ai.model.id']}`;
    return;
  }

  if (name === 'ai.streamObject') {
    span.op = 'gen_ai.invoke_agent';
    return;
  }

  if (name === 'ai.streamObject.doStream') {
    span.op = 'gen_ai.stream_object';
    span.description = `stream_object ${attributes['vercel.ai.model.id']}`;
    return;
  }

  if (name === 'ai.embed') {
    span.op = 'gen_ai.invoke_agent';
    return;
  }

  if (name === 'ai.embed.doEmbed') {
    span.op = 'gen_ai.embed';
    span.description = `embed ${attributes['vercel.ai.model.id']}`;
    return;
  }

  if (name === 'ai.embedMany') {
    span.op = 'gen_ai.invoke_agent';
    return;
  }

  if (name === 'ai.embedMany.doEmbed') {
    span.op = 'gen_ai.embed_many';
    span.description = `embed_many ${attributes['vercel.ai.model.id']}`;
    return;
  }

  if (name.startsWith('ai.stream')) {
    span.op = 'ai.run';
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
