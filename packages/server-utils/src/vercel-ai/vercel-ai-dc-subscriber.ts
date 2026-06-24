/* eslint-disable max-lines */
// `@sentry/conventions` marks several gen_ai attributes (e.g. `GEN_AI_SYSTEM`, `GEN_AI_TOOL_*`,
// `GEN_AI_REQUEST_AVAILABLE_TOOLS`) as deprecated in favour of newer semconv names. We intentionally
// keep emitting the current names so these spans match the OTel-based (v6) integration and what the
// Sentry product consumes today; migrating to the new names is a separate, coordinated change.
/* eslint-disable typescript-eslint/no-deprecated */
import {
  GEN_AI_EMBEDDINGS_INPUT,
  GEN_AI_FUNCTION_ID,
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OPERATION_NAME,
  GEN_AI_OUTPUT_MESSAGES,
  GEN_AI_REQUEST_AVAILABLE_TOOLS,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_RESPONSE_FINISH_REASONS,
  GEN_AI_RESPONSE_ID,
  GEN_AI_RESPONSE_MODEL,
  GEN_AI_RESPONSE_STREAMING,
  GEN_AI_SYSTEM,
  GEN_AI_TOOL_INPUT,
  GEN_AI_TOOL_NAME,
  GEN_AI_TOOL_OUTPUT,
  GEN_AI_TOOL_TYPE,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_USAGE_TOTAL_TOKENS,
} from '@sentry/conventions/attributes';
import { GEN_AI_EXECUTE_TOOL_SPAN_OP, GEN_AI_INVOKE_AGENT_SPAN_OP } from '@sentry/conventions/op';
import type { Span } from '@sentry/core';
import {
  captureException,
  GEN_AI_CONVERSATION_ID_ATTRIBUTE,
  GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE,
  GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE,
  getClient,
  getProviderMetadataAttributes,
  getTruncatedJsonString,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  shouldEnableTruncation,
  SPAN_STATUS_ERROR,
  spanToJSON,
  spanToTraceContext,
  startInactiveSpan,
  withScope,
} from '@sentry/core';
import type { TracingChannel } from 'node:diagnostics_channel';
import { bindTracingChannelToSpan } from '../tracing-channel';

/**
 * The single tracing channel the `ai` package (>= 7) publishes all telemetry lifecycle events to
 * via `node:diagnostics_channel`. Events are discriminated by their `type` field.
 * @see https://github.com/vercel/ai/pull/15660
 */
const AI_SDK_TELEMETRY_TRACING_CHANNEL = 'ai:telemetry';

const ORIGIN = 'auto.vercelai.channel';

// `@sentry/conventions` does not expose these yet, so we keep the literals here.
const GEN_AI_TOOL_CALL_ID_ATTRIBUTE = 'gen_ai.tool.call.id';
const GEN_AI_TOOL_DESCRIPTION_ATTRIBUTE = 'gen_ai.tool.description';
const GEN_AI_EMBEDDINGS_OPERATION = 'embeddings';
const GEN_AI_RERANK_OPERATION = 'rerank';
// The model-call op matches the Vercel AI OTel integration (`gen_ai.generate_content`) rather than
// the generic `gen_ai.chat`, so v6 (OTel) and v7 (channel) produce the same spans.
const GEN_AI_GENERATE_CONTENT_OPERATION = 'generate_content';

// Subset of the `vercel.ai.*` passthrough attributes the OTel integration emits that we reproduce.
const VERCEL_AI_OPERATION_ID_ATTRIBUTE = 'vercel.ai.operationId';
const VERCEL_AI_MODEL_PROVIDER_ATTRIBUTE = 'vercel.ai.model.provider';
const VERCEL_AI_SETTINGS_MAX_RETRIES_ATTRIBUTE = 'vercel.ai.settings.maxRetries';

// Tracks the top-level operationId (and whether it streams) per `callId` so a model-call span can
// name its `doGenerate`/`doStream` operation the same way the OTel integration does. `isStream` is
// the authoritative event-type signal rather than a substring check on the (possibly custom)
// operationId. Cleared when the top-level span ends.
const operationIdByCallId = new Map<string, { operationId: string; isStream: boolean }>();

// Per-operation map of tool name → description, harvested from a model-call /
// top-level event's `tools` (keyed by the shared `callId`). The AI SDK's
// `executeTool` event doesn't carry the tool's description, so we backfill it
// onto the tool span here — without relying on the OTel `vercelAiEventProcessor`
// (which isn't registered in channel/orchestrion mode). Cleared with the
// operation. Only populated when inputs are recorded, matching the OTel path
// (which sources descriptions from the recorded `available_tools`).
const toolDescriptionsByCallId = new Map<string, Map<string, string>>();

// Only top-level operations own the `callId` → operationId mapping; `step`/`languageModelCall`/
// `executeTool` share the parent's `callId`, so they must not clear it.
const ROOT_OPERATION_TYPES = new Set<ChannelEventType>(['generateText', 'streamText', 'embed', 'rerank']);

/** Drop the per-operation `callId` maps once the owning top-level operation settles (success or error). */
export function clearOperationId(data: VercelAiChannelMessage): void {
  if (!ROOT_OPERATION_TYPES.has(data.type)) {
    return;
  }
  const callId = asString(data.event.callId);
  if (callId) {
    operationIdByCallId.delete(callId);
    toolDescriptionsByCallId.delete(callId);
  }
}

/** Record tool name → description from an event's `tools`, so tool spans can backfill the description. */
function recordToolDescriptions(callId: string | undefined, tools: unknown): void {
  if (!callId || !Array.isArray(tools)) {
    return;
  }
  let descriptions = toolDescriptionsByCallId.get(callId);
  for (const tool of tools) {
    if (isRecord(tool) && typeof tool.name === 'string' && typeof tool.description === 'string') {
      descriptions = descriptions ?? new Map();
      if (!descriptions.has(tool.name)) {
        descriptions.set(tool.name, tool.description);
      }
    }
  }
  if (descriptions) {
    toolDescriptionsByCallId.set(callId, descriptions);
  }
}

/**
 * Resolve a tool's description, preferring the per-operation map (populated from the model-call /
 * top-level event's `tools`, v7) and falling back to a `tools` collection on the event itself —
 * which may be an array of `{ name, description }` or a record keyed by tool name (v6).
 */
function resolveToolDescription(callId: string | undefined, toolName: string, tools: unknown): string | undefined {
  const fromMap = callId ? toolDescriptionsByCallId.get(callId)?.get(toolName) : undefined;
  if (fromMap) {
    return fromMap;
  }
  if (Array.isArray(tools)) {
    const match = tools.find(tool => isRecord(tool) && tool.name === toolName);
    return isRecord(match) ? asString(match.description) : undefined;
  }
  if (isRecord(tools)) {
    const tool = tools[toolName];
    return isRecord(tool) ? asString(tool.description) : undefined;
  }
  return undefined;
}

/** The lifecycle event types the `ai:telemetry` channel can carry. */
export type ChannelEventType =
  | 'generateText'
  | 'streamText'
  | 'step'
  | 'languageModelCall'
  | 'executeTool'
  | 'embed'
  | 'rerank';

/**
 * The context object the AI SDK passes through one tracing-channel call. It is the same object
 * identity across `start`/`end`/`asyncEnd`/`error`, and Node's `tracingChannel` attaches
 * `result`/`error` to it as the traced promise settles.
 */
export interface VercelAiChannelMessage {
  type: ChannelEventType;
  event: Record<string, unknown>;
  result?: unknown;
  error?: unknown;
}

/**
 * Platform-provided factory that returns a tracing channel for the given channel name. The factory
 * is responsible for, when `start` fires, calling `transformStart(data)` and storing the returned
 * span on `data._sentrySpan` so the subscriber's `asyncEnd`/`error` handlers can read it.
 *
 * Node passes `@sentry/opentelemetry/tracing-channel`, which uses `bindStore` to additionally make
 * the span the active OTel context for the duration of the traced operation. That is what makes
 * nested AI SDK operations (model calls, tool calls) become children of the enclosing span without
 * any manual parent bookkeeping here.
 */
type VercelAiTracingChannelFactory = <T extends object>(name: string) => TracingChannel<T, T>;

/** Integration-level recording options, pinned at subscribe time so we never look the integration up per event. */
interface VercelAiChannelOptions {
  recordInputs?: boolean;
  recordOutputs?: boolean;
  enableTruncation?: boolean;
}

let subscribed = false;

/**
 * Subscribe Sentry span handlers to the `ai` SDK's native telemetry tracing channel (`ai:telemetry`,
 * available in `ai` >= 7) and emit fully-formed `gen_ai.*` spans directly — no OpenTelemetry span
 * post-processing involved.
 *
 * The integration passes its options in directly (rather than us looking the integration up on every
 * event); the global `dataCollection.genAI` default is still read from the client per event.
 *
 * Safe to always call: on `ai` versions that don't publish to the channel (e.g. < 7) nothing is
 * ever emitted and this is inert, so there is no double-instrumentation against the OTel-based
 * patcher. Idempotent.
 */
export function subscribeVercelAiTracingChannel(
  tracingChannel: VercelAiTracingChannelFactory,
  options: VercelAiChannelOptions = {},
): void {
  if (subscribed) {
    return;
  }
  subscribed = true;

  bindTracingChannelToSpan(
    tracingChannel<VercelAiChannelMessage>(AI_SDK_TELEMETRY_TRACING_CHANNEL),
    data => createSpanFromMessage(data, options),
    {
      // The helper ends the span; we enrich it from the settled result first (tokens, output messages,
      // finish reasons, response model/id, provider metadata) and drop the per-operation `callId` maps.
      beforeSpanEnd: (span, data) => {
        enrichSpanOnEnd(span, data, options);
        clearOperationId(data);
      },
      // AI operation errors are surfaced on the owning span's status; the SDK (and the boundary that
      // awaited the call) owns capturing them. Tool errors are captured explicitly in `enrichSpanOnEnd`.
      captureError: false,
    },
  );
}

/**
 * Transform a channel `start` payload into the span that should be active for the operation. For
 * `step` we deliberately don't open a span (model calls and tool calls are siblings under the
 * invoke_agent span, matching the OTel-based output), so we reuse the active span and mark the
 * payload to skip ending it.
 */
export function createSpanFromMessage(
  data: VercelAiChannelMessage,
  channelOptions: VercelAiChannelOptions,
): Span | undefined {
  const { type, event } = data;

  if (type === 'step' || !event || typeof event !== 'object') {
    // Opt out: returning `undefined` leaves the enclosing `invoke_agent` span as the active context
    // (model-call and tool-call events nest under it) without opening — or ending — a span of its own.
    return undefined;
  }

  const { recordInputs, enableTruncation } = getRecordingOptions(event, channelOptions);
  const provider = asString(event.provider);
  const modelId = asString(event.modelId);
  const callId = asString(event.callId);
  const maxRetries = asNumber(event.maxRetries);

  // Harvest tool descriptions from the operation/model-call `tools` so tool spans can backfill them.
  // Gated on `recordInputs` to match the OTel path, which only records `available_tools` then.
  if (recordInputs) {
    recordToolDescriptions(callId, event.tools);
  }

  const baseAttributes: Record<string, string | number | boolean> = {
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
    ...(provider ? { [GEN_AI_SYSTEM]: provider, [VERCEL_AI_MODEL_PROVIDER_ATTRIBUTE]: provider } : {}),
    ...(modelId ? { [GEN_AI_REQUEST_MODEL]: modelId } : {}),
    ...(maxRetries !== undefined ? { [VERCEL_AI_SETTINGS_MAX_RETRIES_ATTRIBUTE]: maxRetries } : {}),
  };

  switch (type) {
    case 'generateText':
    case 'streamText':
      return buildInvokeAgentSpan(event, baseAttributes, recordInputs, enableTruncation, callId, type === 'streamText');
    case 'languageModelCall':
      return buildModelCallSpan(event, baseAttributes, recordInputs, enableTruncation, callId, modelId);
    case 'executeTool':
      return buildToolSpan(event, recordInputs);
    case 'embed':
      return startGenAiSpan(GEN_AI_EMBEDDINGS_OPERATION, modelId, {
        ...baseAttributes,
        ...(recordInputs && event.value !== undefined ? { [GEN_AI_EMBEDDINGS_INPUT]: safeStringify(event.value) } : {}),
      });
    case 'rerank':
      return startGenAiSpan(GEN_AI_RERANK_OPERATION, modelId, baseAttributes);
    default:
      // Unknown event type: opt out rather than open a span we can't shape correctly.
      return undefined;
  }
}

type Attributes = Record<string, string | number | boolean>;

/** Start a `gen_ai.<operation>` span named `<operation> <suffix>` (or just `<operation>` when no suffix). */
function startGenAiSpan(operation: string, suffix: string | undefined, attributes: Attributes): Span {
  return startInactiveSpan({
    name: suffix ? `${operation} ${suffix}` : operation,
    op: `gen_ai.${operation}`,
    attributes: { [GEN_AI_OPERATION_NAME]: operation, ...attributes },
  });
}

function buildInvokeAgentSpan(
  event: Record<string, unknown>,
  baseAttributes: Attributes,
  recordInputs: boolean,
  enableTruncation: boolean,
  callId: string | undefined,
  isStream: boolean,
): Span {
  const functionId = asString(event.functionId);
  const operationId = asString(event.operationId) ?? (isStream ? 'ai.streamText' : 'ai.generateText');
  if (callId) {
    operationIdByCallId.set(callId, { operationId, isStream });
  }
  return startGenAiSpan(GEN_AI_INVOKE_AGENT_SPAN_OP, functionId, {
    ...baseAttributes,
    [VERCEL_AI_OPERATION_ID_ATTRIBUTE]: operationId,
    [GEN_AI_RESPONSE_STREAMING]: isStream,
    ...(functionId ? { [GEN_AI_FUNCTION_ID]: functionId } : {}),
    ...(recordInputs ? buildInputMessageAttributes(event, enableTruncation) : {}),
  });
}

function buildModelCallSpan(
  event: Record<string, unknown>,
  baseAttributes: Attributes,
  recordInputs: boolean,
  enableTruncation: boolean,
  callId: string | undefined,
  modelId: string | undefined,
): Span {
  const parent = callId ? operationIdByCallId.get(callId) : undefined;
  const operationId = parent
    ? `${parent.operationId}.${parent.isStream ? 'doStream' : 'doGenerate'}`
    : 'ai.generateText.doGenerate';
  return startGenAiSpan(GEN_AI_GENERATE_CONTENT_OPERATION, modelId, {
    ...baseAttributes,
    [VERCEL_AI_OPERATION_ID_ATTRIBUTE]: operationId,
    ...(recordInputs ? buildInputMessageAttributes(event, enableTruncation) : {}),
    ...(recordInputs && Array.isArray(event.tools)
      ? { [GEN_AI_REQUEST_AVAILABLE_TOOLS]: safeStringify(event.tools) }
      : {}),
  });
}

function buildToolSpan(event: Record<string, unknown>, recordInputs: boolean): Span {
  const toolCall = isRecord(event.toolCall) ? event.toolCall : {};
  const toolName = asString(toolCall.toolName);
  const toolCallId = asString(event.toolCallId) ?? asString(toolCall.toolCallId);
  const toolInput = toolCall.input ?? toolCall.args;
  // The `executeTool` event has no description; backfill it from the operation's recorded tools.
  // Gated on `recordInputs` to match the OTel path (descriptions come from the recorded tools list).
  const description =
    recordInputs && toolName ? resolveToolDescription(asString(event.callId), toolName, event.tools) : undefined;
  return startGenAiSpan(GEN_AI_EXECUTE_TOOL_SPAN_OP, toolName, {
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
    [GEN_AI_TOOL_TYPE]: 'function',
    ...(toolName ? { [GEN_AI_TOOL_NAME]: toolName } : {}),
    ...(toolCallId ? { [GEN_AI_TOOL_CALL_ID_ATTRIBUTE]: toolCallId } : {}),
    ...(description ? { [GEN_AI_TOOL_DESCRIPTION_ATTRIBUTE]: description } : {}),
    ...(recordInputs && toolInput !== undefined ? { [GEN_AI_TOOL_INPUT]: safeStringify(toolInput) } : {}),
  });
}

/**
 * Best-effort enrichment from the resolved value the AI SDK attaches to the channel context.
 * Everything here is guarded: when a field is missing or the shape differs across `ai` versions,
 * we simply don't set the attribute rather than emit a malformed span.
 */
export function enrichSpanOnEnd(
  span: Span,
  data: VercelAiChannelMessage,
  channelOptions: VercelAiChannelOptions,
): void {
  const { type, result } = data;
  if (!isRecord(result)) {
    return;
  }

  const { recordOutputs } = getRecordingOptions(data.event, channelOptions);

  if (type === 'executeTool') {
    if (recordOutputs) {
      span.setAttribute(GEN_AI_TOOL_OUTPUT, safeStringify(result.output ?? result));
    }
    // From V5 on, tool errors are not rejected (so the `error` channel verb never fires) — they
    // surface as `tool-error` content on the resolved result. Mirror the OTel path by marking the
    // span and capturing the error.
    const output = isRecord(result.output) ? result.output : undefined;
    if (output?.type === 'tool-error') {
      captureToolError(span, data, output.error);
    }
    return;
  }

  // `languageModelCall` results report usage as `{ total }` objects; top-level/step results report
  // flat numbers. `tokenCount` handles both.
  const usage = isRecord(result.usage) ? result.usage : undefined;
  if (usage) {
    const inputTokens = tokenCount(usage.inputTokens) ?? tokenCount(usage.tokens);
    const outputTokens = tokenCount(usage.outputTokens);
    const totalTokens = tokenCount(usage.totalTokens) ?? sum(inputTokens, outputTokens);
    if (inputTokens !== undefined) {
      span.setAttribute(GEN_AI_USAGE_INPUT_TOKENS, inputTokens);
    }
    if (outputTokens !== undefined) {
      span.setAttribute(GEN_AI_USAGE_OUTPUT_TOKENS, outputTokens);
    }
    if (totalTokens !== undefined) {
      span.setAttribute(GEN_AI_USAGE_TOTAL_TOKENS, totalTokens);
    }
  }

  // Match the OTel integration: finish reasons live on the model-call (`generate_content`) span, not
  // on the top-level `invoke_agent` span.
  const finishReason = getFinishReason(result);
  if (finishReason && type === 'languageModelCall') {
    span.setAttribute(GEN_AI_RESPONSE_FINISH_REASONS, safeStringify([finishReason]));
  }

  const response = isRecord(result.response) ? result.response : undefined;
  const responseId = asString(response?.id) ?? asString(result.responseId);
  if (responseId) {
    span.setAttribute(GEN_AI_RESPONSE_ID, responseId);
  }
  const responseModel = asString(response?.modelId) ?? asString(data.event.modelId);
  if (responseModel) {
    span.setAttribute(GEN_AI_RESPONSE_MODEL, responseModel);
  }

  // Provider-specific cache/reasoning/prediction token breakdowns and `gen_ai.conversation.id`.
  // The channel exposes `providerMetadata` as an object (the OTel path parses it from a string);
  // both share `getProviderMetadataAttributes` so the emitted shape is identical.
  const providerMetadata = (result as { providerMetadata?: unknown }).providerMetadata;
  const providerAttributes = getProviderMetadataAttributes(providerMetadata);
  // Don't overwrite a conversation id already set on span start (e.g. by `conversationIdIntegration`
  // from a user-set scope value); the provider-derived id is only a fallback. Matches the OTel path.
  if (
    GEN_AI_CONVERSATION_ID_ATTRIBUTE in providerAttributes &&
    spanToJSON(span).data[GEN_AI_CONVERSATION_ID_ATTRIBUTE]
  ) {
    // oxlint-disable-next-line typescript/no-dynamic-delete
    delete providerAttributes[GEN_AI_CONVERSATION_ID_ATTRIBUTE];
  }
  span.setAttributes(providerAttributes);

  if (recordOutputs) {
    // `languageModelCall` exposes the response as a `content` parts array; top-level results expose
    // `text` + `toolCalls`. Both normalize into the OTel `gen_ai.output.messages` assistant message.
    const parts =
      type === 'languageModelCall' && Array.isArray(result.content)
        ? partsFromContent(result.content)
        : partsFromTextAndToolCalls(result.text, result.toolCalls);
    const outputMessages = buildOutputMessages(parts, finishReason);
    if (outputMessages) {
      span.setAttribute(GEN_AI_OUTPUT_MESSAGES, outputMessages);
    }
  }
}

/** Maps a Vercel AI finish reason to the OTel `gen_ai.output.messages` form (`tool-calls` → `tool_call`). */
function normalizeFinishReason(finishReason: string | undefined): string {
  return finishReason === 'tool-calls' ? 'tool_call' : (finishReason ?? 'stop');
}

/** Reads the finish reason from a result — a string on top-level results, `{ unified }` on model calls. */
function getFinishReason(result: Record<string, unknown>): string | undefined {
  const finishReason = result.finishReason;
  if (typeof finishReason === 'string') {
    return finishReason;
  }
  return isRecord(finishReason) ? asString(finishReason.unified) : undefined;
}

/** Reads a token count that may be a plain number or a `{ total }` object (model-call usage). */
function tokenCount(value: unknown): number | undefined {
  return asNumber(value) ?? (isRecord(value) ? asNumber(value.total) : undefined);
}

function buildOutputMessages(
  parts: Array<Record<string, unknown>>,
  finishReason: string | undefined,
): string | undefined {
  if (!parts.length) {
    return undefined;
  }
  return safeStringify([{ role: 'assistant', parts, finish_reason: normalizeFinishReason(finishReason) }]);
}

function toolCallPart(toolCall: Record<string, unknown>): Record<string, unknown> {
  const args = toolCall.input ?? toolCall.args;
  return {
    type: 'tool_call',
    id: asString(toolCall.toolCallId),
    name: asString(toolCall.toolName),
    arguments: typeof args === 'string' ? args : safeStringify(args ?? {}),
  };
}

function partsFromContent(content: unknown[]): Array<Record<string, unknown>> {
  const parts: Array<Record<string, unknown>> = [];
  for (const item of content) {
    if (!isRecord(item)) {
      continue;
    }
    if (item.type === 'text' && typeof item.text === 'string') {
      parts.push({ type: 'text', content: item.text });
    } else if (item.type === 'tool-call') {
      parts.push(toolCallPart(item));
    }
  }
  return parts;
}

function partsFromTextAndToolCalls(text: unknown, toolCalls: unknown): Array<Record<string, unknown>> {
  const parts: Array<Record<string, unknown>> = [];
  if (typeof text === 'string' && text.length) {
    parts.push({ type: 'text', content: text });
  }
  if (Array.isArray(toolCalls)) {
    for (const toolCall of toolCalls) {
      if (isRecord(toolCall)) {
        parts.push(toolCallPart(toolCall));
      }
    }
  }
  return parts;
}

function captureToolError(span: Span, data: VercelAiChannelMessage, error: unknown): void {
  span.setStatus({
    code: SPAN_STATUS_ERROR,
    message: error instanceof Error ? error.message : 'tool_error',
  });

  const toolCall = isRecord(data.event.toolCall) ? data.event.toolCall : {};
  const toolName = asString(toolCall.toolName);
  const toolCallId = asString(data.event.toolCallId) ?? asString(toolCall.toolCallId);

  withScope(scope => {
    scope.setContext('trace', spanToTraceContext(span));
    if (toolName) {
      scope.setTag('vercel.ai.tool.name', toolName);
    }
    if (toolCallId) {
      scope.setTag('vercel.ai.tool.callId', toolCallId);
    }
    scope.setLevel('error');
    captureException(
      error instanceof Error ? error : new Error(typeof error === 'string' ? error : 'Tool execution failed'),
      {
        mechanism: { type: 'auto.vercelai.channel', handled: false },
      },
    );
  });
}

function getRecordingOptions(
  event: Record<string, unknown>,
  channelOptions: VercelAiChannelOptions,
): {
  recordInputs: boolean;
  recordOutputs: boolean;
  enableTruncation: boolean;
} {
  const genAI = getClient()?.getDataCollectionOptions().genAI;

  return {
    recordInputs: resolveRecording(channelOptions.recordInputs, event.recordInputs, genAI?.inputs),
    recordOutputs: resolveRecording(channelOptions.recordOutputs, event.recordOutputs, genAI?.outputs),
    enableTruncation: shouldEnableTruncation(channelOptions.enableTruncation),
  };
}

/**
 * Mirrors the OTel integration's `determineRecordingSettings` precedence: an integration-level option
 * wins, then the per-call `experimental_telemetry.recordInputs/recordOutputs` flag the AI SDK forwards
 * on the channel event, then the global `dataCollection.genAI` default.
 *
 * NOTE: the OTel integration also defaults recording to `true` for a call with
 * `experimental_telemetry: { isEnabled: true }`. The `ai:telemetry` channel does not expose `isEnabled`
 * (nor a resolved recording flag), so that per-call default cannot be reproduced here — v7 users who
 * want inputs/outputs recorded must enable `dataCollection.genAI` or set `recordInputs`/`recordOutputs`.
 */
function resolveRecording(integrationOption: unknown, perCallOption: unknown, globalDefault: unknown): boolean {
  if (typeof integrationOption === 'boolean') {
    return integrationOption;
  }
  if (typeof perCallOption === 'boolean') {
    return perCallOption;
  }
  return globalDefault === true;
}

function buildInputMessageAttributes(
  event: Record<string, unknown>,
  enableTruncation: boolean,
): Record<string, string | number> {
  const attributes: Record<string, string | number> = {};

  // `ai` >= 7 forbids system messages in `messages`/`prompt` and exposes the system prompt as a
  // separate `instructions` field. The OTel path lifts the system message out of the prompt into
  // `gen_ai.system_instructions` as `[{ type: 'text', content }]`; mirror that shape here.
  const instructions = asString(event.instructions);
  if (instructions) {
    attributes[GEN_AI_SYSTEM_INSTRUCTIONS_ATTRIBUTE] = safeStringify([{ type: 'text', content: instructions }]);
  }

  // The AI SDK start events extend `StandardizedPrompt`; messages live on `messages`, otherwise the
  // simpler `prompt` field is used.
  const messages = event.messages ?? event.prompt;
  if (messages !== undefined) {
    attributes[GEN_AI_INPUT_MESSAGES] = enableTruncation ? getTruncatedJsonString(messages) : safeStringify(messages);
    // The original (pre-truncation) message count, so the product can show how many were dropped.
    attributes[GEN_AI_INPUT_MESSAGES_ORIGINAL_LENGTH_ATTRIBUTE] = Array.isArray(messages) ? messages.length : 1;
  }

  return attributes;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && !isNaN(value) ? value : undefined;
}

function sum(a: number | undefined, b: number | undefined): number | undefined {
  return a === undefined && b === undefined ? undefined : (a ?? 0) + (b ?? 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function safeStringify(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return '[unserializable]';
  }
}
