import { subscribe } from 'node:diagnostics_channel';
import {
  captureException,
  getClient,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  startInactiveSpan,
  withScope,
} from '@sentry/core';
import type { Span } from '@sentry/core';
import { INTEGRATION_NAME } from './constants';
import { safeStringify } from './dc-utils';
import { determineRecordingSettings } from './instrumentation';
import type {
  AiSdkContentPart,
  AiSdkFinishReason,
  AiSdkOperationId,
  AiSdkToolCall,
  AiSdkUsage,
  VercelAiIntegration,
} from './types';

const ORIGIN = 'auto.vercelai.dc';

interface CallState {
  rootSpan: Span;
  inferenceSpan?: Span;
  toolSpans: Map<string, Span>;
  recordInputs: boolean;
  recordOutputs: boolean;
}

const callStates = new Map<string, CallState>();

const OPERATION_NAME_MAP: Record<AiSdkOperationId, string> = {
  'ai.generateText': 'invoke_agent',
  'ai.streamText': 'invoke_agent',
  'ai.generateObject': 'invoke_agent',
  'ai.streamObject': 'invoke_agent',
  'ai.embed': 'embeddings',
  'ai.embedMany': 'embeddings',
  'ai.rerank': 'rerank',
};

function mapOperationName(operationId: string): string {
  return OPERATION_NAME_MAP[operationId as AiSdkOperationId] ?? operationId;
}

function getRecordingSettings(event: Record<string, unknown>): { recordInputs: boolean; recordOutputs: boolean } {
  const client = getClient();
  const integration = client?.getIntegrationByName<VercelAiIntegration>(INTEGRATION_NAME);
  const defaultPii = integration ? Boolean(client?.getOptions().sendDefaultPii) : false;
  return determineRecordingSettings(
    integration?.options,
    {
      recordInputs: event.recordInputs as boolean | undefined,
      recordOutputs: event.recordOutputs as boolean | undefined,
    },
    undefined,
    defaultPii,
  );
}

function setUsageAttributes(span: Span, u: AiSdkUsage): void {
  if (u.inputTokens != null) span.setAttribute('gen_ai.usage.input_tokens', u.inputTokens);
  if (u.outputTokens != null) span.setAttribute('gen_ai.usage.output_tokens', u.outputTokens);
  if (u.inputTokens != null || u.outputTokens != null)
    span.setAttribute('gen_ai.usage.total_tokens', (u.inputTokens ?? 0) + (u.outputTokens ?? 0));
  if (u.inputTokenDetails?.cacheReadTokens != null)
    span.setAttribute('gen_ai.usage.input_tokens.cached', u.inputTokenDetails.cacheReadTokens);
  if (u.inputTokenDetails?.cacheWriteTokens != null)
    span.setAttribute('gen_ai.usage.input_tokens.cache_write', u.inputTokenDetails.cacheWriteTokens);
  if (u.outputTokenDetails?.reasoningTokens != null)
    span.setAttribute('gen_ai.usage.output_tokens.reasoning', u.outputTokenDetails.reasoningTokens);
}

function normalizeFinishReason(reason: AiSdkFinishReason): string {
  return reason === 'tool-calls' ? 'tool_call' : reason;
}

function buildOutputMessages(content: AiSdkContentPart[], finishReason: AiSdkFinishReason): string | undefined {
  const parts: Record<string, unknown>[] = [];
  const text = content
    .filter(p => p.type === 'text' && p.text)
    .map(p => p.text)
    .join('');
  if (text) parts.push({ type: 'text', content: text });
  for (const tc of content.filter(p => p.type === 'tool-call')) {
    const args = typeof tc.input === 'string' ? tc.input : safeStringify(tc.input ?? {});
    parts.push({ type: 'tool_call', id: tc.toolCallId, name: tc.toolName, arguments: args });
  }
  if (parts.length === 0) return undefined;
  return safeStringify([{ role: 'assistant', parts, finish_reason: normalizeFinishReason(finishReason) }]);
}

function formatInputMessages(messages: unknown[]): string | undefined {
  return safeStringify(
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
      const val = safeStringify([{ type: 'text', content: instructions }]);
      if (val) attributes['gen_ai.system_instructions'] = val;
    }
    const messages = event.messages as unknown[] | undefined;
    if (Array.isArray(messages)) {
      const val = formatInputMessages(messages);
      if (val) attributes['gen_ai.input.messages'] = val;
    }
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
    if (Array.isArray(messages)) {
      const val = formatInputMessages(messages);
      if (val) attributes['gen_ai.input.messages'] = val;
    }
    const tools = event.tools as unknown[] | undefined;
    if (Array.isArray(tools)) {
      const val = safeStringify(tools);
      if (val) attributes['gen_ai.request.available_tools'] = val;
    }
  }
  state.inferenceSpan = startInactiveSpan({ name: `generate_content ${modelId}`, attributes });
}

export function handleOnLanguageModelCallEnd(event: Record<string, unknown>): void {
  const state = callStates.get(event.callId as string);
  if (!state?.inferenceSpan) return;

  const usage = event.usage as AiSdkUsage | undefined;
  if (usage) setUsageAttributes(state.inferenceSpan, usage);
  const finishReason = event.finishReason as AiSdkFinishReason | undefined;
  if (finishReason) {
    const val = safeStringify([normalizeFinishReason(finishReason)]);
    if (val) state.inferenceSpan.setAttribute('gen_ai.response.finish_reasons', val);
  }
  if (event.responseId) state.inferenceSpan.setAttribute('gen_ai.response.id', event.responseId as string);

  if (state.recordOutputs) {
    const content = event.content as AiSdkContentPart[] | undefined;
    if (Array.isArray(content)) {
      const out = buildOutputMessages(content, finishReason ?? 'stop');
      if (out) state.inferenceSpan.setAttribute('gen_ai.output.messages', out);
    }
  }
  state.inferenceSpan.end();
  state.inferenceSpan = undefined;
}

export function handleOnToolExecutionStart(event: Record<string, unknown>): void {
  const state = callStates.get(event.callId as string);
  if (!state) return;
  const toolCall = event.toolCall as AiSdkToolCall;
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
    const val = typeof toolCall.input === 'string' ? toolCall.input : safeStringify(toolCall.input);
    if (val) attributes['gen_ai.tool.input'] = val;
  }
  state.toolSpans.set(
    toolCall.toolCallId,
    startInactiveSpan({ name: `execute_tool ${toolCall.toolName}`, attributes }),
  );
}

export function handleOnToolExecutionEnd(event: Record<string, unknown>): void {
  const state = callStates.get(event.callId as string);
  if (!state) return;
  const toolCall = event.toolCall as AiSdkToolCall;
  if (!toolCall) return;
  const toolSpan = state.toolSpans.get(toolCall.toolCallId);
  if (!toolSpan) return;

  const toolOutput = event.toolOutput as { type: string; output?: unknown; error?: Error } | undefined;
  if (toolOutput?.type === 'tool-result' && state.recordOutputs && toolOutput.output != null) {
    const val = safeStringify(toolOutput.output);
    if (val) toolSpan.setAttribute('gen_ai.tool.output', val);
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

  const usage = (event.totalUsage ?? event.usage) as AiSdkUsage | undefined;
  if (usage) setUsageAttributes(state.rootSpan, usage);
  const finishReason = event.finishReason as AiSdkFinishReason | undefined;
  if (finishReason) {
    const val = safeStringify([normalizeFinishReason(finishReason)]);
    if (val) state.rootSpan.setAttribute('gen_ai.response.finish_reasons', val);
  }
  if (state.recordOutputs) {
    const content: AiSdkContentPart[] = [];
    const text = event.text as string | undefined;
    if (text) content.push({ type: 'text', text });
    for (const tc of (event.toolCalls as AiSdkToolCall[] | undefined) ?? []) {
      content.push({ type: 'tool-call', toolCallId: tc.toolCallId, toolName: tc.toolName, input: tc.input });
    }
    const out = buildOutputMessages(content, finishReason ?? 'stop');
    if (out) state.rootSpan.setAttribute('gen_ai.output.messages', out);
  }
  for (const [, s] of state.toolSpans) s.end();
  state.toolSpans.clear();
  if (state.inferenceSpan) state.inferenceSpan.end();
  state.rootSpan.end();
  callStates.delete(event.callId as string);
}

export function handleOnError(event: Record<string, unknown>): void {
  const state = callStates.get(event.callId as string);
  if (!state) return;
  const error = event.error instanceof Error ? event.error : undefined;
  const endWithError = (span: Span): void => {
    span.setStatus({ code: 2, message: error?.message ?? 'unknown error' });
    span.end();
  };
  for (const [, s] of state.toolSpans) endWithError(s);
  state.toolSpans.clear();
  if (state.inferenceSpan) endWithError(state.inferenceSpan);
  endWithError(state.rootSpan);
  callStates.delete(event.callId as string);
}

const DC_CHANNEL = 'aisdk:telemetry';

const DC_HANDLERS: Record<string, (event: Record<string, unknown>) => void> = {
  onStart: handleOnStart,
  onLanguageModelCallStart: handleOnLanguageModelCallStart,
  onLanguageModelCallEnd: handleOnLanguageModelCallEnd,
  onToolExecutionStart: handleOnToolExecutionStart,
  onToolExecutionEnd: handleOnToolExecutionEnd,
  onEnd: handleOnEnd,
  onError: handleOnError,
};

let subscribed = false;

/** Subscribe to AI SDK v7+ diagnostic channel. Inert on v3-v6. */
export function subscribeAiSdkDiagnosticChannel(): void {
  if (subscribed) return;
  subscribed = true;

  try {
    subscribe(DC_CHANNEL, (message: unknown) => {
      const msg = message as { type: string; event: Record<string, unknown> };
      try {
        DC_HANDLERS[msg?.type]?.(msg.event);
      } catch {
        // Never let telemetry processing break the application
      }
    });
  } catch {
    // subscribe may not be available on all runtimes
  }
}
