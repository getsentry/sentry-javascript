import {
  captureException,
  getClient,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  startInactiveSpan,
  withScope,
} from '@sentry/core';
import type { Span } from '@sentry/core';
import type { VercelAiIntegration } from './types';
import { INTEGRATION_NAME } from './constants';
import { determineRecordingSettings } from './instrumentation';

const ORIGIN = 'auto.vercelai.dc';

interface CallState {
  rootSpan: Span;
  inferenceSpan?: Span;
  toolSpans: Map<string, Span>;
  recordInputs: boolean;
  recordOutputs: boolean;
}

const callStates = new Map<string, CallState>();

function mapOperationName(operationId: string): string {
  switch (operationId) {
    case 'ai.generateText':
    case 'ai.streamText':
    case 'ai.generateObject':
    case 'ai.streamObject':
      return 'invoke_agent';
    case 'ai.embed':
    case 'ai.embedMany':
      return 'embeddings';
    case 'ai.rerank':
      return 'rerank';
    default:
      return operationId;
  }
}

function getRecordingSettings(event: Record<string, unknown>): { recordInputs: boolean; recordOutputs: boolean } {
  const client = getClient();
  const integration = client?.getIntegrationByName<VercelAiIntegration>(INTEGRATION_NAME);
  const integrationOptions = integration?.options;
  const defaultRecordingEnabled = integration ? Boolean(client?.getOptions().sendDefaultPii) : false;

  return determineRecordingSettings(
    integrationOptions,
    {
      recordInputs: event.recordInputs as boolean | undefined,
      recordOutputs: event.recordOutputs as boolean | undefined,
    },
    undefined,
    defaultRecordingEnabled,
  );
}

interface Usage {
  inputTokens?: number;
  outputTokens?: number;
  inputTokenDetails?: { cacheReadTokens?: number; cacheWriteTokens?: number };
  outputTokenDetails?: { reasoningTokens?: number };
}

interface ContentPart {
  type: string;
  text?: string;
  toolCallId?: string;
  toolName?: string;
  input?: unknown;
}
interface ToolCall {
  toolCallId: string;
  toolName: string;
  input?: unknown;
}

function setUsageAttributes(span: Span, u: Usage): void {
  if (u.inputTokens != null) span.setAttribute('gen_ai.usage.input_tokens', u.inputTokens);
  if (u.outputTokens != null) span.setAttribute('gen_ai.usage.output_tokens', u.outputTokens);
  if (u.inputTokens != null || u.outputTokens != null) {
    span.setAttribute('gen_ai.usage.total_tokens', (u.inputTokens ?? 0) + (u.outputTokens ?? 0));
  }
  if (u.inputTokenDetails?.cacheReadTokens != null)
    span.setAttribute('gen_ai.usage.input_tokens.cached', u.inputTokenDetails.cacheReadTokens);
  if (u.inputTokenDetails?.cacheWriteTokens != null)
    span.setAttribute('gen_ai.usage.input_tokens.cache_write', u.inputTokenDetails.cacheWriteTokens);
  if (u.outputTokenDetails?.reasoningTokens != null)
    span.setAttribute('gen_ai.usage.output_tokens.reasoning', u.outputTokenDetails.reasoningTokens);
}

function normalizeFinishReason(reason: unknown): string {
  if (typeof reason !== 'string') return 'stop';
  return reason === 'tool-calls' ? 'tool_call' : reason;
}

function buildOutputMessages(content: ContentPart[], finishReason: unknown): string | undefined {
  const parts: Record<string, unknown>[] = [];
  const text = content
    .filter(p => p.type === 'text' && p.text)
    .map(p => p.text)
    .join('');
  if (text) parts.push({ type: 'text', content: text });
  for (const tc of content.filter(p => p.type === 'tool-call')) {
    parts.push({
      type: 'tool_call',
      id: tc.toolCallId,
      name: tc.toolName,
      arguments: typeof tc.input === 'string' ? tc.input : JSON.stringify(tc.input ?? {}),
    });
  }
  if (parts.length === 0) return undefined;
  return JSON.stringify([{ role: 'assistant', parts, finish_reason: normalizeFinishReason(finishReason) }]);
}

function formatInputMessages(messages: unknown[]): string {
  return JSON.stringify(
    messages.map((m: unknown) =>
      m && typeof m === 'object' && 'role' in m ? m : { role: 'user', content: String(m) },
    ),
  );
}

export function handleOnStart(event: Record<string, unknown>): void {
  const operationId = event.operationId as string;
  const callId = event.callId as string;
  const modelId = event.modelId as string;
  const functionId = event.functionId as string | undefined;
  const operationName = mapOperationName(operationId);
  const { recordInputs, recordOutputs } = getRecordingSettings(event);

  const spanName = functionId ? `${operationName} ${functionId}` : `${operationName} ${modelId}`;
  const attributes: Record<string, string | number | boolean> = {
    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: `gen_ai.${operationName}`,
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
    'gen_ai.operation.name': operationName,
    'gen_ai.request.model': modelId,
  };
  if (functionId) attributes['gen_ai.agent.name'] = functionId;

  if (recordInputs) {
    const instructions = event.instructions as string | undefined;
    if (instructions) {
      attributes['gen_ai.system_instructions'] = JSON.stringify([{ type: 'text', content: instructions }]);
    }
    const messages = event.messages as unknown[] | undefined;
    if (Array.isArray(messages)) attributes['gen_ai.input.messages'] = formatInputMessages(messages);
  }

  const rootSpan = startInactiveSpan({ name: spanName, attributes });
  callStates.set(callId, { rootSpan, toolSpans: new Map(), recordInputs, recordOutputs });
}

export function handleOnLanguageModelCallStart(event: Record<string, unknown>): void {
  const state = callStates.get(event.callId as string);
  if (!state) return;

  const modelId = event.modelId as string;
  const attributes: Record<string, string | number | boolean> = {
    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.generate_content',
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
    'gen_ai.operation.name': 'generate_content',
    'gen_ai.request.model': modelId,
    'gen_ai.system': event.provider as string,
  };
  if (state.recordInputs) {
    const messages = event.messages as unknown[] | undefined;
    if (Array.isArray(messages)) attributes['gen_ai.input.messages'] = formatInputMessages(messages);
    const tools = event.tools as unknown[] | undefined;
    if (Array.isArray(tools)) attributes['gen_ai.request.available_tools'] = JSON.stringify(tools);
  }
  state.inferenceSpan = startInactiveSpan({ name: `generate_content ${modelId}`, attributes });
}

export function handleOnLanguageModelCallEnd(event: Record<string, unknown>): void {
  const state = callStates.get(event.callId as string);
  if (!state?.inferenceSpan) return;

  const usage = event.usage as Usage | undefined;
  if (usage) setUsageAttributes(state.inferenceSpan, usage);
  const finishReason = event.finishReason as string | undefined;
  if (finishReason) {
    state.inferenceSpan.setAttribute(
      'gen_ai.response.finish_reasons',
      JSON.stringify([normalizeFinishReason(finishReason)]),
    );
  }
  if (event.responseId) state.inferenceSpan.setAttribute('gen_ai.response.id', event.responseId as string);

  if (state.recordOutputs) {
    const content = event.content as ContentPart[] | undefined;
    if (Array.isArray(content)) {
      const out = buildOutputMessages(content, finishReason);
      if (out) state.inferenceSpan.setAttribute('gen_ai.output.messages', out);
    }
  }
  state.inferenceSpan.end();
  state.inferenceSpan = undefined;
}

export function handleOnToolExecutionStart(event: Record<string, unknown>): void {
  const state = callStates.get(event.callId as string);
  if (!state) return;
  const toolCall = event.toolCall as ToolCall;
  if (!toolCall) return;

  const attributes: Record<string, string | number | boolean> = {
    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'gen_ai.execute_tool',
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
    'gen_ai.operation.name': 'execute_tool',
    'gen_ai.tool.name': toolCall.toolName,
    'gen_ai.tool.call.id': toolCall.toolCallId,
    'gen_ai.tool.type': 'function',
  };
  if (state.recordInputs && toolCall.input != null) {
    attributes['gen_ai.tool.input'] =
      typeof toolCall.input === 'string' ? toolCall.input : JSON.stringify(toolCall.input);
  }
  state.toolSpans.set(
    toolCall.toolCallId,
    startInactiveSpan({ name: `execute_tool ${toolCall.toolName}`, attributes }),
  );
}

export function handleOnToolExecutionEnd(event: Record<string, unknown>): void {
  const state = callStates.get(event.callId as string);
  if (!state) return;
  const toolCall = event.toolCall as ToolCall;
  if (!toolCall) return;
  const toolSpan = state.toolSpans.get(toolCall.toolCallId);
  if (!toolSpan) return;

  const toolOutput = event.toolOutput as { type: string; output?: unknown; error?: Error } | undefined;
  if (toolOutput?.type === 'tool-result' && state.recordOutputs && toolOutput.output != null) {
    try {
      toolSpan.setAttribute('gen_ai.tool.output', JSON.stringify(toolOutput.output));
    } catch {
      // ignore
    }
  } else if (toolOutput?.type === 'tool-error' && toolOutput.error) {
    toolSpan.setStatus({ code: 2, message: toolOutput.error.message });
    withScope(scope => {
      scope.setTag('vercel.ai.tool.name', toolCall.toolName);
      scope.setTag('vercel.ai.tool.callId', toolCall.toolCallId);
      scope.setLevel('error');
      captureException(toolOutput.error, { mechanism: { type: 'auto.vercelai.dc', handled: false } });
    });
  }
  toolSpan.end();
  state.toolSpans.delete(toolCall.toolCallId);
}

export function handleOnEnd(event: Record<string, unknown>): void {
  const state = callStates.get(event.callId as string);
  if (!state) return;

  const usage = (event.totalUsage ?? event.usage) as Usage | undefined;
  if (usage) setUsageAttributes(state.rootSpan, usage);
  const finishReason = event.finishReason as string | undefined;
  if (finishReason) {
    state.rootSpan.setAttribute(
      'gen_ai.response.finish_reasons',
      JSON.stringify([normalizeFinishReason(finishReason)]),
    );
  }

  if (state.recordOutputs) {
    const content: ContentPart[] = [];
    const text = event.text as string | undefined;
    if (text) content.push({ type: 'text', text });
    const toolCalls = event.toolCalls as ToolCall[] | undefined;
    if (toolCalls) {
      for (const tc of toolCalls) {
        content.push({ type: 'tool-call', toolCallId: tc.toolCallId, toolName: tc.toolName, input: tc.input });
      }
    }
    const out = buildOutputMessages(content, finishReason);
    if (out) state.rootSpan.setAttribute('gen_ai.output.messages', out);
  }
  state.rootSpan.end();
  callStates.delete(event.callId as string);
}

export function handleOnError(event: Record<string, unknown>): void {
  const state = callStates.get(event.callId as string);
  if (!state) return;
  const error = (event.error ?? event) as Error;
  const endWithError = (span: Span): void => {
    span.setStatus({ code: 2, message: error?.message });
    span.end();
  };
  for (const [, s] of state.toolSpans) endWithError(s);
  state.toolSpans.clear();
  if (state.inferenceSpan) endWithError(state.inferenceSpan);
  endWithError(state.rootSpan);
  callStates.delete(event.callId as string);
}
