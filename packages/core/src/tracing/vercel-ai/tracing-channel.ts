/* eslint-disable max-lines */

import { getClient, withScope } from '../../currentScopes';
import { captureException } from '../../exports';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '../../semanticAttributes';
import { SPAN_STATUS_ERROR } from '../../tracing';
import { startSpanManual } from '../../tracing/trace';
import type { Span, SpanAttributeValue } from '../../types/span';
import { spanToJSON } from '../../utils/spanUtils';
import {
  GEN_AI_EMBEDDINGS_INPUT_ATTRIBUTE,
  GEN_AI_EMBEDDINGS_OPERATION_ATTRIBUTE,
  GEN_AI_EXECUTE_TOOL_OPERATION_ATTRIBUTE,
  GEN_AI_FUNCTION_ID_ATTRIBUTE,
  GEN_AI_GENERATE_CONTENT_OPERATION_ATTRIBUTE,
  GEN_AI_INPUT_MESSAGES_ATTRIBUTE,
  GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE,
  GEN_AI_INVOKE_AGENT_OPERATION_ATTRIBUTE,
  GEN_AI_OPERATION_NAME_ATTRIBUTE,
  GEN_AI_OUTPUT_MESSAGES_ATTRIBUTE,
  GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE,
  GEN_AI_REQUEST_FREQUENCY_PENALTY_ATTRIBUTE,
  GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE,
  GEN_AI_REQUEST_MODEL_ATTRIBUTE,
  GEN_AI_REQUEST_PRESENCE_PENALTY_ATTRIBUTE,
  GEN_AI_REQUEST_STOP_SEQUENCES_ATTRIBUTE,
  GEN_AI_REQUEST_STREAM_ATTRIBUTE,
  GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE,
  GEN_AI_REQUEST_TOP_K_ATTRIBUTE,
  GEN_AI_REQUEST_TOP_P_ATTRIBUTE,
  GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE,
  GEN_AI_RESPONSE_ID_ATTRIBUTE,
  GEN_AI_RESPONSE_MODEL_ATTRIBUTE,
  GEN_AI_RESPONSE_STREAMING_ATTRIBUTE,
  GEN_AI_RERANK_DO_RERANK_OPERATION_ATTRIBUTE,
  GEN_AI_SYSTEM_ATTRIBUTE,
  GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE,
  GEN_AI_TOOL_CALL_ID_ATTRIBUTE,
  GEN_AI_TOOL_DESCRIPTION_ATTRIBUTE,
  GEN_AI_TOOL_INPUT_ATTRIBUTE,
  GEN_AI_TOOL_NAME_ATTRIBUTE,
  GEN_AI_TOOL_OUTPUT_ATTRIBUTE,
  GEN_AI_TOOL_TYPE_ATTRIBUTE,
  GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_INPUT_TOKENS_CACHE_WRITE_ATTRIBUTE,
  GEN_AI_USAGE_INPUT_TOKENS_CACHED_ATTRIBUTE,
  GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE,
} from '../ai/gen-ai-attributes';
import { extractSystemInstructions, getJsonString, getTruncatedJsonString, shouldEnableTruncation } from '../ai/utils';
import { toolDescriptionMap } from './constants';

const ORIGIN = 'auto.vercelai.otel';

export type VercelAiTracingChannelEventType =
  | 'generateText'
  | 'streamText'
  | 'step'
  | 'languageModelCall'
  | 'executeTool'
  | 'embed'
  | 'rerank';

/**
 * Shape published by AI SDK v7 on `node:diagnostics_channel.tracingChannel('ai:telemetry')`.
 * Keep this in sync with `packages/ai/src/telemetry/tracing-channel.ts` in vercel/ai.
 */
export interface VercelAiTracingChannelMessage {
  type: VercelAiTracingChannelEventType;
  event: unknown;
  result?: unknown;
  error?: unknown;
}

interface RecordingOptions {
  recordInputs?: boolean;
  recordOutputs?: boolean;
}

interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cachedInputTokens?: number;
  cacheWriteInputTokens?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getEvent(message: VercelAiTracingChannelMessage): Record<string, unknown> {
  return isRecord(message.event) ? message.event : {};
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function getNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function getBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function setAttributeIfDefined(
  attributes: Record<string, SpanAttributeValue>,
  key: string,
  value: SpanAttributeValue | undefined,
): void {
  if (value !== undefined) {
    attributes[key] = value;
  }
}

function safeJsonStringify(value: unknown): string | undefined {
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}

function safeGetJsonString(value: unknown, enableTruncation: boolean): string | undefined {
  try {
    return enableTruncation ? getTruncatedJsonString(value) : getJsonString(value);
  } catch {
    return undefined;
  }
}

function getVercelAiIntegrationOptions(): { enableTruncation?: boolean } & RecordingOptions {
  const integration = getClient()?.getIntegrationByName('VercelAI') as
    | { options?: { enableTruncation?: boolean } & RecordingOptions }
    | undefined;
  return integration?.options ?? {};
}

function resolveRecordingOption(
  integrationOption: boolean | undefined,
  eventOption: boolean | undefined,
  globalOption: boolean | undefined,
): boolean {
  if (integrationOption === false || eventOption === false) {
    return false;
  }

  return integrationOption ?? eventOption ?? Boolean(globalOption);
}

function getRecordingSettings(event: Record<string, unknown>): Required<RecordingOptions> {
  const integrationOptions = getVercelAiIntegrationOptions();
  const genAI = getClient()?.getDataCollectionOptions().genAI;

  return {
    recordInputs: resolveRecordingOption(
      integrationOptions.recordInputs,
      getBoolean(event.recordInputs),
      genAI?.inputs,
    ),
    recordOutputs: resolveRecordingOption(
      integrationOptions.recordOutputs,
      getBoolean(event.recordOutputs),
      genAI?.outputs,
    ),
  };
}

function getEnableTruncation(): boolean {
  return shouldEnableTruncation(getVercelAiIntegrationOptions().enableTruncation);
}

function getFunctionId(event: Record<string, unknown>): string | undefined {
  return getString(event.functionId);
}

function getModelId(event: Record<string, unknown>): string {
  return getString(event.modelId) ?? 'unknown';
}

function getProvider(event: Record<string, unknown>): string | undefined {
  return getString(event.provider);
}

function makeBaseAttributes(operationName: string): Record<string, SpanAttributeValue> {
  return {
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: `gen_ai.${operationName}`,
    [GEN_AI_OPERATION_NAME_ATTRIBUTE]: operationName,
  };
}

function addFunctionId(attributes: Record<string, SpanAttributeValue>, event: Record<string, unknown>): void {
  const functionId = getFunctionId(event);
  if (functionId) {
    attributes[GEN_AI_FUNCTION_ID_ATTRIBUTE] = functionId;
  }
}

function addOperationId(attributes: Record<string, SpanAttributeValue>, event: Record<string, unknown>): void {
  const operationId = getString(event.operationId);
  if (operationId) {
    attributes['vercel.ai.operationId'] = operationId;
  }
}

function addRequestParameters(attributes: Record<string, SpanAttributeValue>, event: Record<string, unknown>): void {
  setAttributeIfDefined(attributes, GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE, getNumber(event.temperature));
  setAttributeIfDefined(attributes, GEN_AI_REQUEST_TOP_P_ATTRIBUTE, getNumber(event.topP));
  setAttributeIfDefined(attributes, GEN_AI_REQUEST_TOP_K_ATTRIBUTE, getNumber(event.topK));
  setAttributeIfDefined(attributes, GEN_AI_REQUEST_FREQUENCY_PENALTY_ATTRIBUTE, getNumber(event.frequencyPenalty));
  setAttributeIfDefined(attributes, GEN_AI_REQUEST_PRESENCE_PENALTY_ATTRIBUTE, getNumber(event.presencePenalty));
  setAttributeIfDefined(attributes, GEN_AI_REQUEST_MAX_TOKENS_ATTRIBUTE, getNumber(event.maxOutputTokens));

  if (Array.isArray(event.stopSequences)) {
    const stopSequences = safeJsonStringify(event.stopSequences);
    setAttributeIfDefined(attributes, GEN_AI_REQUEST_STOP_SEQUENCES_ATTRIBUTE, stopSequences);
  }
}

function instructionsToSystemInstructions(instructions: unknown): string | undefined {
  if (instructions == null) {
    return undefined;
  }

  const instructionArray = Array.isArray(instructions) ? instructions : [instructions];
  const parts: Array<Record<string, unknown>> = [];

  for (const instruction of instructionArray) {
    if (typeof instruction === 'string') {
      parts.push({ type: 'text', content: instruction });
      continue;
    }

    if (!isRecord(instruction)) {
      continue;
    }

    const content = instruction.content;
    if (typeof content === 'string') {
      parts.push({ type: 'text', content });
    } else if (Array.isArray(content)) {
      parts.push(...content.filter(isRecord));
    }
  }

  return parts.length > 0 ? safeJsonStringify(parts) : undefined;
}

function addInputAttributes(attributes: Record<string, SpanAttributeValue>, event: Record<string, unknown>): void {
  const enableTruncation = getEnableTruncation();
  const systemInstructions = instructionsToSystemInstructions(event.instructions);
  if (systemInstructions) {
    attributes[GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE] = systemInstructions;
  }

  if (Array.isArray(event.messages)) {
    const { systemInstructions: extractedSystemInstructions, filteredMessages } = extractSystemInstructions(
      event.messages,
    );
    if (!attributes[GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE] && extractedSystemInstructions) {
      attributes[GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE] = extractedSystemInstructions;
    }

    const messagesJson = safeGetJsonString(filteredMessages, enableTruncation);
    if (messagesJson) {
      attributes[GEN_AI_INPUT_MESSAGES_ATTRIBUTE] = messagesJson;
      attributes[GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE] = Array.isArray(filteredMessages)
        ? filteredMessages.length
        : 1;
    }
  }
}

function getToolName(tool: Record<string, unknown>): string | undefined {
  return getString(tool.name) ?? getString(tool.toolName);
}

function getToolDescription(tool: Record<string, unknown>): string | undefined {
  return getString(tool.description);
}

function normalizeToolDefinition(tool: unknown): Record<string, unknown> | undefined {
  if (!isRecord(tool)) {
    return undefined;
  }

  const name = getToolName(tool);
  if (!name) {
    return undefined;
  }

  return {
    name,
    ...(getToolDescription(tool) ? { description: getToolDescription(tool) } : {}),
    ...(getString(tool.type) ? { type: getString(tool.type) } : { type: 'function' }),
  };
}

function getAvailableTools(tools: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(tools)) {
    return tools.map(normalizeToolDefinition).filter((tool): tool is Record<string, unknown> => tool !== undefined);
  }

  if (!isRecord(tools)) {
    return [];
  }

  return Object.entries(tools).map(([name, tool]) => ({
    name,
    ...(isRecord(tool) && getToolDescription(tool) ? { description: getToolDescription(tool) } : {}),
    type: 'function',
  }));
}

function addAvailableTools(attributes: Record<string, SpanAttributeValue>, tools: unknown): void {
  const availableTools = getAvailableTools(tools);
  if (availableTools.length === 0) {
    return;
  }

  const availableToolsJson = safeJsonStringify(availableTools);
  if (availableToolsJson) {
    attributes[GEN_AI_REQUEST_AVAILABLE_TOOLS_ATTRIBUTE] = availableToolsJson;
  }
}

function rememberToolDescriptions(span: Span, tools: unknown): void {
  const availableTools = getAvailableTools(tools);
  if (availableTools.length === 0) {
    return;
  }

  const descriptions = new Map<string, string>();
  for (const tool of availableTools) {
    const name = getToolName(tool);
    const description = getToolDescription(tool);
    if (name && description) {
      descriptions.set(name, description);
    }
  }

  const parentSpanId = spanToJSON(span).parent_span_id;
  if (parentSpanId && descriptions.size > 0) {
    toolDescriptionMap.set(parentSpanId, descriptions);
  }
}

function applyToolDescription(span: Span, attributes: Record<string, SpanAttributeValue>): void {
  const toolName = attributes[GEN_AI_TOOL_NAME_ATTRIBUTE];
  const parentSpanId = spanToJSON(span).parent_span_id;
  if (typeof toolName !== 'string' || !parentSpanId) {
    return;
  }

  const description = toolDescriptionMap.get(parentSpanId)?.get(toolName);
  if (description) {
    span.setAttribute(GEN_AI_TOOL_DESCRIPTION_ATTRIBUTE, description);
  }
}

function getTokenCount(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (isRecord(value)) {
    return getNumber(value.total) ?? getNumber(value.cached) ?? getNumber(value.cacheRead);
  }

  return undefined;
}

function extractUsage(usage: unknown): TokenUsage {
  if (!isRecord(usage)) {
    return {};
  }

  const inputTokenDetails = isRecord(usage.inputTokenDetails) ? usage.inputTokenDetails : undefined;
  const inputTokens = getTokenCount(usage.inputTokens);
  const outputTokens = getTokenCount(usage.outputTokens);

  return {
    inputTokens,
    outputTokens,
    totalTokens: getTokenCount(usage.totalTokens),
    cachedInputTokens:
      getNumber(inputTokenDetails?.cacheReadTokens) ??
      getNumber(inputTokenDetails?.cacheRead) ??
      (isRecord(usage.inputTokens)
        ? (getNumber(usage.inputTokens.cacheRead) ?? getNumber(usage.inputTokens.cached))
        : undefined),
    cacheWriteInputTokens:
      getNumber(inputTokenDetails?.cacheWriteTokens) ??
      getNumber(inputTokenDetails?.cacheWrite) ??
      (isRecord(usage.inputTokens) ? getNumber(usage.inputTokens.cacheWrite) : undefined),
  };
}

function setUsageAttributes(span: Span, usage: unknown): void {
  const { inputTokens, outputTokens, totalTokens, cachedInputTokens, cacheWriteInputTokens } = extractUsage(usage);

  if (inputTokens !== undefined) {
    span.setAttribute(GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE, inputTokens);
  }
  if (outputTokens !== undefined) {
    span.setAttribute(GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE, outputTokens);
  }
  if (totalTokens !== undefined) {
    span.setAttribute(GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE, totalTokens);
  } else if (inputTokens !== undefined || outputTokens !== undefined) {
    span.setAttribute(GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE, (inputTokens ?? 0) + (outputTokens ?? 0));
  }
  if (cachedInputTokens !== undefined) {
    span.setAttribute(GEN_AI_USAGE_INPUT_TOKENS_CACHED_ATTRIBUTE, cachedInputTokens);
  }
  if (cacheWriteInputTokens !== undefined) {
    span.setAttribute(GEN_AI_USAGE_INPUT_TOKENS_CACHE_WRITE_ATTRIBUTE, cacheWriteInputTokens);
  }
}

function normalizeFinishReason(reason: unknown): string | undefined {
  if (typeof reason === 'string') {
    return reason === 'tool-calls' ? 'tool_call' : reason;
  }

  if (isRecord(reason)) {
    return normalizeFinishReason(reason.unified ?? reason.raw);
  }

  return undefined;
}

function getContentParts(content: unknown): unknown[] {
  return Array.isArray(content) ? content : [];
}

function buildOutputMessagesFromContent(content: unknown, fallbackText?: unknown): string | undefined {
  const parts: Array<Record<string, unknown>> = [];
  const textParts: string[] = [];

  for (const part of getContentParts(content)) {
    if (!isRecord(part)) {
      continue;
    }

    if (part.type === 'text' && typeof part.text === 'string') {
      textParts.push(part.text);
      continue;
    }

    if (part.type === 'tool-call') {
      const input = part.input;
      const serializedInput = typeof input === 'string' ? input : safeJsonStringify(input ?? {});
      parts.push({
        type: 'tool_call',
        id: getString(part.toolCallId),
        name: getString(part.toolName),
        arguments: serializedInput,
      });
    }
  }

  if (textParts.length === 0 && typeof fallbackText === 'string' && fallbackText.length > 0) {
    textParts.push(fallbackText);
  }

  if (textParts.length > 0) {
    parts.unshift({ type: 'text', content: textParts.join('') });
  }

  return parts.length > 0 ? safeJsonStringify([{ role: 'assistant', parts }]) : undefined;
}

function getResult(message: VercelAiTracingChannelMessage): Record<string, unknown> | undefined {
  return isRecord(message.result) ? message.result : undefined;
}

function getResultUsage(result: Record<string, unknown> | undefined): unknown {
  return result?.usage ?? result?.totalUsage;
}

function getToolOutput(result: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  const output = result?.output;
  return isRecord(output) ? output : undefined;
}

function getErrorMessage(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === 'string' ? error : undefined;
}

function captureToolError(span: Span, toolOutput: Record<string, unknown>): void {
  const error = toolOutput.error;
  if (!error) {
    return;
  }

  const toolName = getString(toolOutput.toolName);
  const toolCallId = getString(toolOutput.toolCallId);
  const spanContext = span.spanContext();

  withScope(scope => {
    scope.setContext('trace', {
      trace_id: spanContext.traceId,
      span_id: spanContext.spanId,
    });

    if (toolName) {
      scope.setTag('vercel.ai.tool.name', toolName);
    }
    if (toolCallId) {
      scope.setTag('vercel.ai.tool.callId', toolCallId);
    }
    scope.setLevel('error');

    captureException(error, {
      mechanism: {
        type: ORIGIN,
        handled: false,
      },
    });
  });
}

function startInvokeAgentSpan(message: VercelAiTracingChannelMessage): Span {
  const event = getEvent(message);
  const operationName = 'invoke_agent';
  const attributes = makeBaseAttributes(operationName);
  const functionId = getFunctionId(event);

  addFunctionId(attributes, event);
  addOperationId(attributes, event);
  addRequestParameters(attributes, event);
  setAttributeIfDefined(attributes, GEN_AI_REQUEST_MODEL_ATTRIBUTE, getModelId(event));
  setAttributeIfDefined(attributes, GEN_AI_RESPONSE_MODEL_ATTRIBUTE, getModelId(event));
  setAttributeIfDefined(attributes, GEN_AI_REQUEST_STREAM_ATTRIBUTE, message.type === 'streamText');
  setAttributeIfDefined(attributes, GEN_AI_RESPONSE_STREAMING_ATTRIBUTE, message.type === 'streamText');

  if (getRecordingSettings(event).recordInputs) {
    addInputAttributes(attributes, event);
  }

  return startSpanManual(
    {
      name: functionId ? `invoke_agent ${functionId}` : 'invoke_agent',
      op: GEN_AI_INVOKE_AGENT_OPERATION_ATTRIBUTE,
      attributes,
    },
    span => span,
  );
}

function startStepSpan(message: VercelAiTracingChannelMessage): Span {
  const event = getEvent(message);
  const attributes = makeBaseAttributes('invoke_agent');
  const stepNumber = getNumber(event.stepNumber);
  if (stepNumber !== undefined) {
    attributes['vercel.ai.stepNumber'] = stepNumber;
  }

  return startSpanManual(
    {
      name: stepNumber !== undefined ? `step ${stepNumber}` : 'step',
      op: GEN_AI_INVOKE_AGENT_OPERATION_ATTRIBUTE,
      attributes,
    },
    span => span,
  );
}

function startLanguageModelCallSpan(message: VercelAiTracingChannelMessage): Span {
  const event = getEvent(message);
  const attributes = makeBaseAttributes('generate_content');

  addFunctionId(attributes, event);
  addRequestParameters(attributes, event);
  setAttributeIfDefined(attributes, GEN_AI_REQUEST_MODEL_ATTRIBUTE, getModelId(event));
  setAttributeIfDefined(attributes, GEN_AI_RESPONSE_MODEL_ATTRIBUTE, getModelId(event));
  setAttributeIfDefined(attributes, GEN_AI_SYSTEM_ATTRIBUTE, getProvider(event));

  if (getRecordingSettings(event).recordInputs) {
    addInputAttributes(attributes, event);
    addAvailableTools(attributes, event.tools);
  }

  const modelId = getModelId(event);
  const span = startSpanManual(
    {
      name: `generate_content ${modelId}`,
      op: GEN_AI_GENERATE_CONTENT_OPERATION_ATTRIBUTE,
      attributes,
    },
    startedSpan => startedSpan,
  );

  rememberToolDescriptions(span, event.tools);
  return span;
}

function startToolSpan(message: VercelAiTracingChannelMessage): Span {
  const event = getEvent(message);
  const toolCall = isRecord(event.toolCall) ? event.toolCall : {};
  const toolName = getString(toolCall.toolName) ?? 'unknown';
  const toolCallId = getString(toolCall.toolCallId);
  const attributes = makeBaseAttributes('execute_tool');

  setAttributeIfDefined(attributes, GEN_AI_TOOL_NAME_ATTRIBUTE, toolName);
  setAttributeIfDefined(attributes, GEN_AI_TOOL_CALL_ID_ATTRIBUTE, toolCallId);
  setAttributeIfDefined(attributes, GEN_AI_TOOL_TYPE_ATTRIBUTE, 'function');

  if (getRecordingSettings(event).recordInputs) {
    const input = toolCall.input;
    const serializedInput = typeof input === 'string' ? input : safeJsonStringify(input ?? {});
    setAttributeIfDefined(attributes, GEN_AI_TOOL_INPUT_ATTRIBUTE, serializedInput);
  }

  const span = startSpanManual(
    {
      name: `execute_tool ${toolName}`,
      op: GEN_AI_EXECUTE_TOOL_OPERATION_ATTRIBUTE,
      attributes,
    },
    startedSpan => startedSpan,
  );

  applyToolDescription(span, attributes);
  return span;
}

function startEmbeddingSpan(message: VercelAiTracingChannelMessage): Span {
  const event = getEvent(message);
  const attributes = makeBaseAttributes('embeddings');

  addFunctionId(attributes, event);
  addOperationId(attributes, event);
  setAttributeIfDefined(attributes, GEN_AI_REQUEST_MODEL_ATTRIBUTE, getModelId(event));
  setAttributeIfDefined(attributes, GEN_AI_RESPONSE_MODEL_ATTRIBUTE, getModelId(event));
  setAttributeIfDefined(attributes, GEN_AI_SYSTEM_ATTRIBUTE, getProvider(event));

  if (getRecordingSettings(event).recordInputs) {
    const value = event.value;
    const serializedValue = Array.isArray(value)
      ? safeJsonStringify(value)
      : safeGetJsonString(value, getEnableTruncation());
    setAttributeIfDefined(attributes, GEN_AI_EMBEDDINGS_INPUT_ATTRIBUTE, serializedValue);
  }

  return startSpanManual(
    {
      name: `embeddings ${getModelId(event)}`,
      op: GEN_AI_EMBEDDINGS_OPERATION_ATTRIBUTE,
      attributes,
    },
    span => span,
  );
}

function startRerankSpan(message: VercelAiTracingChannelMessage): Span {
  const event = getEvent(message);
  const attributes = makeBaseAttributes('rerank');

  addFunctionId(attributes, event);
  addOperationId(attributes, event);
  setAttributeIfDefined(attributes, GEN_AI_REQUEST_MODEL_ATTRIBUTE, getModelId(event));
  setAttributeIfDefined(attributes, GEN_AI_RESPONSE_MODEL_ATTRIBUTE, getModelId(event));
  setAttributeIfDefined(attributes, GEN_AI_SYSTEM_ATTRIBUTE, getProvider(event));

  return startSpanManual(
    {
      name: `rerank ${getModelId(event)}`,
      op: GEN_AI_RERANK_DO_RERANK_OPERATION_ATTRIBUTE,
      attributes,
    },
    span => span,
  );
}

export function startVercelAiTracingChannelSpan(message: VercelAiTracingChannelMessage): Span {
  switch (message.type) {
    case 'generateText':
    case 'streamText':
      return startInvokeAgentSpan(message);
    case 'step':
      return startStepSpan(message);
    case 'languageModelCall':
      return startLanguageModelCallSpan(message);
    case 'executeTool':
      return startToolSpan(message);
    case 'embed':
      return startEmbeddingSpan(message);
    case 'rerank':
      return startRerankSpan(message);
    default:
      return startSpanManual(
        {
          name: 'ai telemetry',
          op: GEN_AI_INVOKE_AGENT_OPERATION_ATTRIBUTE,
          attributes: makeBaseAttributes('invoke_agent'),
        },
        span => span,
      );
  }
}

function finishInvokeAgentSpan(span: Span, message: VercelAiTracingChannelMessage): void {
  const event = getEvent(message);
  const result = getResult(message);

  setUsageAttributes(span, getResultUsage(result));

  const responseModel =
    getString(result?.responseModel) ?? (isRecord(result?.response) ? getString(result.response.modelId) : undefined);
  if (responseModel) {
    span.setAttribute(GEN_AI_RESPONSE_MODEL_ATTRIBUTE, responseModel);
  }

  const finishReason = normalizeFinishReason(
    result?.finishReason ?? (isRecord(result?.finalStep) ? result.finalStep.finishReason : undefined),
  );
  if (finishReason) {
    span.setAttribute(GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE, JSON.stringify([finishReason]));
  }

  if (getRecordingSettings(event).recordOutputs) {
    const outputMessages = buildOutputMessagesFromContent(result?.content, result?.text);
    if (outputMessages) {
      span.setAttribute(GEN_AI_OUTPUT_MESSAGES_ATTRIBUTE, outputMessages);
    }
  }
}

function finishStepSpan(span: Span, message: VercelAiTracingChannelMessage): void {
  const result = getResult(message);

  setUsageAttributes(span, getResultUsage(result));

  const finishReason = normalizeFinishReason(result?.finishReason);
  if (finishReason) {
    span.setAttribute(GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE, JSON.stringify([finishReason]));
  }

  toolDescriptionMap.delete(spanToJSON(span).span_id);
}

function finishLanguageModelCallSpan(span: Span, message: VercelAiTracingChannelMessage): void {
  const event = getEvent(message);
  const result = getResult(message);

  setUsageAttributes(span, result?.usage);

  const response = isRecord(result?.response) ? result.response : undefined;
  const responseModel = getString(response?.modelId) ?? getModelId(event);
  span.setAttribute(GEN_AI_RESPONSE_MODEL_ATTRIBUTE, responseModel);
  const responseId = getString(response?.id);
  if (responseId) {
    span.setAttribute(GEN_AI_RESPONSE_ID_ATTRIBUTE, responseId);
  }

  const finishReason = normalizeFinishReason(result?.finishReason);
  if (finishReason) {
    span.setAttribute(GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE, JSON.stringify([finishReason]));
  }

  if (getRecordingSettings(event).recordOutputs) {
    const outputMessages = buildOutputMessagesFromContent(result?.content);
    if (outputMessages) {
      span.setAttribute(GEN_AI_OUTPUT_MESSAGES_ATTRIBUTE, outputMessages);
    }
  }
}

function finishToolSpan(span: Span, message: VercelAiTracingChannelMessage): void {
  const event = getEvent(message);
  const result = getResult(message);
  const toolOutput = getToolOutput(result);

  if (!toolOutput) {
    return;
  }

  if (getRecordingSettings(event).recordOutputs) {
    const output = toolOutput.output;
    const serializedOutput = typeof output === 'string' ? output : safeJsonStringify(output);
    if (serializedOutput) {
      span.setAttribute(GEN_AI_TOOL_OUTPUT_ATTRIBUTE, serializedOutput);
    }
  }

  if (toolOutput.type === 'tool-error') {
    const errorMessage = getErrorMessage(toolOutput.error) ?? 'Tool execution failed';
    span.setStatus({ code: SPAN_STATUS_ERROR, message: errorMessage });
    captureToolError(span, toolOutput);
  }
}

function finishEmbeddingSpan(span: Span, message: VercelAiTracingChannelMessage): void {
  setUsageAttributes(span, getResult(message)?.usage);
}

export function finishVercelAiTracingChannelSpan(span: Span, message: VercelAiTracingChannelMessage): void {
  switch (message.type) {
    case 'generateText':
    case 'streamText':
      finishInvokeAgentSpan(span, message);
      break;
    case 'step':
      finishStepSpan(span, message);
      break;
    case 'languageModelCall':
      finishLanguageModelCallSpan(span, message);
      break;
    case 'executeTool':
      finishToolSpan(span, message);
      break;
    case 'embed':
      finishEmbeddingSpan(span, message);
      break;
    case 'rerank':
      break;
  }
}

export function failVercelAiTracingChannelSpan(span: Span, message: VercelAiTracingChannelMessage): void {
  const errorMessage = getErrorMessage(message.error) ?? 'AI SDK telemetry span failed';
  span.setStatus({ code: SPAN_STATUS_ERROR, message: errorMessage });

  if (message.type === 'step') {
    toolDescriptionMap.delete(spanToJSON(span).span_id);
  }
}
