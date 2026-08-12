/* eslint-disable max-lines */
import {
  GEN_AI_CONVERSATION_ID,
  GEN_AI_EMBEDDINGS_INPUT,
  GEN_AI_FUNCTION_ID,
  GEN_AI_INPUT_MESSAGES,
  GEN_AI_OPERATION_NAME,
  GEN_AI_OUTPUT_MESSAGES,
  GEN_AI_PROVIDER_NAME,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_RESPONSE_FINISH_REASONS,
  GEN_AI_RESPONSE_ID,
  GEN_AI_RESPONSE_MODEL,
  GEN_AI_RESPONSE_STREAMING,
  GEN_AI_SYSTEM_INSTRUCTIONS,
  GEN_AI_TOOL_CALL_ARGUMENTS,
  GEN_AI_TOOL_CALL_RESULT,
  GEN_AI_TOOL_DEFINITIONS,
  GEN_AI_TOOL_NAME,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_USAGE_TOTAL_TOKENS,
} from '@sentry/conventions/attributes';
import type { Span, SpanAttributes } from '@sentry/core';
import {
  _INTERNAL_skipAiProviderWrapping,
  captureException,
  getClient,
  isObjectLike,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SPAN_STATUS_ERROR,
  spanToJSON,
  spanToTraceContext,
  startInactiveSpan,
  stringify,
  withScope,
} from '@sentry/core';
import type { TracingChannel } from 'node:diagnostics_channel';
import type { GenAiOptions } from '../ai/core/utils';
import { getProviderMetadataAttributes } from '../ai/vercel-ai';
import { WORKERS_AI_INTEGRATION_NAME } from '../ai/workers-ai/constants';
import { bindTracingChannelToSpan } from '../tracing-channel';
import { asNumber, asString, isReadableStream, type StreamedModelCallResult, sum, tapModelCallStream } from './util';

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
const GEN_AI_INVOKE_AGENT_OPERATION = 'invoke_agent';
const GEN_AI_EXECUTE_TOOL_OPERATION = 'execute_tool';
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
// (which sources descriptions from the recorded `tool.definitions`).
const toolDescriptionsByCallId = new Map<string, Map<string, string>>();

// A streamed `streamText` operation's own channel result is always `undefined` (the SDK exposes the
// stream only on the model call), so its `invoke_agent` span can't be enriched from the channel. We
// key the span by `callId` and enrich it as each streamed model call drains — the model calls flush
// before the operation's own span ends. The running token sum lives on the span's own attributes.
const invokeAgentSpanByCallId = new Map<string, Span>();

// Only top-level operations own the `callId` → operationId mapping; `step`/`languageModelCall`/
// `executeTool` share the parent's `callId`, so they must not clear it.
const ROOT_OPERATION_TYPES = new Set<ChannelEventType>([
  'generateText',
  'streamText',
  'generateObject',
  'embed',
  'embedMany',
  'rerank',
]);

/** Drop the per-operation `callId` maps once the owning top-level operation settles (success or error). */
export function clearOperationId(data: VercelAiChannelMessage): void {
  if (!ROOT_OPERATION_TYPES.has(data.type)) {
    return;
  }
  const callId = asString(data.event.callId);
  if (callId) {
    clearOperationCallId(callId);
  }
}

/**
 * Drop the per-operation `callId` maps for a single id. The v6 orchestrion adapter uses this to clear a
 * `streamText` operation only after its lazily-run model call settles — the operation's own span ends
 * synchronously (when `streamText` returns) but the model call runs later as the stream is consumed, and
 * it still needs the operation's `operationId`/`isStream` entry to name itself `ai.streamText.doStream`.
 */
export function clearOperationCallId(callId: string): void {
  operationIdByCallId.delete(callId);
  toolDescriptionsByCallId.delete(callId);
  invokeAgentSpanByCallId.delete(callId);
}

/** Record tool name → description from an event's `tools`, so tool spans can backfill the description. */
function recordToolDescriptions(callId: string | undefined, tools: unknown): void {
  if (!callId || !Array.isArray(tools)) {
    return;
  }
  let descriptions = toolDescriptionsByCallId.get(callId);
  for (const tool of tools) {
    if (isObjectLike(tool) && typeof tool.name === 'string' && typeof tool.description === 'string') {
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
    const match = tools.find(tool => isObjectLike(tool) && tool.name === toolName);
    return isObjectLike(match) ? asString(match.description) : undefined;
  }
  if (isObjectLike(tools)) {
    const tool = tools[toolName];
    return isObjectLike(tool) ? asString(tool.description) : undefined;
  }
  return undefined;
}

/** The lifecycle event types the `ai:telemetry` channel can carry. */
export type ChannelEventType =
  | 'generateText'
  | 'streamText'
  | 'generateObject'
  | 'step'
  | 'languageModelCall'
  | 'executeTool'
  | 'embed'
  | 'embedMany'
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
export type VercelAiTracingChannelFactory = <T extends object>(name: string) => TracingChannel<T, T>;

/** Integration-level recording options, pinned at subscribe time so we never look the integration up per event. */
export type VercelAiChannelOptions = GenAiOptions;

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
 * patcher. The integration's `setupOnce` guarantees this runs a single time.
 */
export function subscribeVercelAiTracingChannel(
  tracingChannel: VercelAiTracingChannelFactory,
  options: VercelAiChannelOptions = {},
): void {
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
      // A streamed model call resolves before its stream is drained, so we tap the stream, keep the
      // span open, and end it (via `end`) once the final usage/finish/output chunks arrive.
      deferSpanEnd: ({ data, end }) => deferStreamedModelCallEnd(data, options, end),
    },
  );
}

/**
 * When a `languageModelCall` resolves to a live `ReadableStream`, defer ending its span: swap in a
 * passthrough that forwards chunks to the SDK untouched while aggregating usage/finish/output, then
 * enrich and end the span once the stream settles. Returns `false` for anything that isn't a streamed
 * model call so the helper ends the span as usual.
 */
function deferStreamedModelCallEnd(
  data: VercelAiChannelMessage,
  options: VercelAiChannelOptions,
  end: (error?: unknown) => void,
): boolean {
  if (data.type !== 'languageModelCall' || !isObjectLike(data.result)) {
    return false;
  }
  const result = data.result;
  const stream = result.stream;
  if (!isReadableStream(stream)) {
    return false;
  }

  const callId = asString(data.event.callId);
  const { recordOutputs } = getRecordingOptions(data.event, options);
  result.stream = tapModelCallStream(
    stream,
    final => {
      // Reshape the aggregate into the result `enrichSpanOnEnd` expects, then let `end` run it (it calls
      // `beforeSpanEnd`). Enriching the model-call span and the parent from the same aggregate keeps
      // streamed and non-streamed spans identical.
      data.result = { ...result, ...streamedResultToChannelResult(final) };
      end();
      enrichInvokeAgentFromStream(callId, final, recordOutputs);
    },
    error => end(error),
  );

  return true;
}

/** Map the tapped stream aggregate onto the `languageModelCall` result shape `enrichSpanOnEnd` reads. */
export function streamedResultToChannelResult(final: StreamedModelCallResult): Record<string, unknown> {
  const content: Array<Record<string, unknown>> = [];
  if (final.text) {
    content.push({ type: 'text', text: final.text });
  }
  for (const toolCall of final.toolCalls) {
    content.push({ type: 'tool-call', ...toolCall });
  }

  return {
    content,
    ...(final.usage !== undefined ? { usage: final.usage } : {}),
    ...(final.finishReason !== undefined ? { finishReason: final.finishReason } : {}),
    ...(final.providerMetadata !== undefined ? { providerMetadata: final.providerMetadata } : {}),
    ...(final.responseId || final.responseModel
      ? {
          response: {
            ...(final.responseId ? { id: final.responseId } : {}),
            ...(final.responseModel ? { modelId: final.responseModel } : {}),
          },
        }
      : {}),
  };
}

/**
 * Propagate a streamed model call's usage (summed across the operation's model calls) and output onto
 * the enclosing `invoke_agent` span, which has no channel result of its own. Runs before that span ends
 * because the operation's completion promise settles only after every model-call stream has drained.
 */
function enrichInvokeAgentFromStream(
  callId: string | undefined,
  final: StreamedModelCallResult,
  recordOutputs: boolean,
): void {
  const span = callId ? invokeAgentSpanByCallId.get(callId) : undefined;
  if (!span) {
    return;
  }

  const usage = isObjectLike(final.usage) ? final.usage : undefined;
  if (usage) {
    const input = tokenCount(usage.inputTokens) ?? tokenCount(usage.promptTokens) ?? tokenCount(usage.tokens);
    const output = tokenCount(usage.outputTokens) ?? tokenCount(usage.completionTokens);
    addTokensToSpan(span, GEN_AI_USAGE_INPUT_TOKENS, input);
    addTokensToSpan(span, GEN_AI_USAGE_OUTPUT_TOKENS, output);
    addTokensToSpan(span, GEN_AI_USAGE_TOTAL_TOKENS, tokenCount(usage.totalTokens) ?? sum(input, output));
  }

  if (recordOutputs) {
    const parts = partsFromTextAndToolCalls(final.text, final.toolCalls);
    const outputMessages = buildOutputMessages(parts, getFinishReason({ finishReason: final.finishReason }));
    if (outputMessages) {
      span.setAttribute(GEN_AI_OUTPUT_MESSAGES, outputMessages);
    }
  }
}

/** Add `value` into a span's numeric token attribute, using the span itself as the running sum. */
function addTokensToSpan(span: Span, attribute: string, value: number | undefined): void {
  if (value === undefined) {
    return;
  }
  const current = spanToJSON(span).attributes[attribute];
  span.setAttribute(attribute, (typeof current === 'number' ? current : 0) + value);
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

  const { recordInputs } = getRecordingOptions(event, channelOptions);
  const provider = asString(event.provider);
  const modelId = asString(event.modelId);
  const callId = asString(event.callId);
  const maxRetries = asNumber(event.maxRetries);

  // Harvest tool descriptions from the operation/model-call `tools` so tool spans can backfill them.
  // Gated on `recordInputs` to match the OTel path, which only records `tool.definitions` then.
  if (recordInputs) {
    recordToolDescriptions(callId, event.tools);
  }

  const baseAttributes: Record<string, string | number | boolean> = {
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
    ...(provider ? { [GEN_AI_PROVIDER_NAME]: provider, [VERCEL_AI_MODEL_PROVIDER_ATTRIBUTE]: provider } : {}),
    ...(modelId ? { [GEN_AI_REQUEST_MODEL]: modelId } : {}),
    ...(maxRetries !== undefined ? { [VERCEL_AI_SETTINGS_MAX_RETRIES_ATTRIBUTE]: maxRetries } : {}),
  };

  switch (type) {
    case 'generateText':
    case 'streamText':
    case 'generateObject':
      // `generateObject` builds the same `invoke_agent` span as `generateText` (non-streaming); its
      // distinct `ai.generateObject` operationId rides on `event.operationId`. The JSON-schema attribute
      // the OTel path derives from the SDK's Zod schema is not reconstructed on the channel path.
      return buildInvokeAgentSpan(event, baseAttributes, recordInputs, callId, type === 'streamText');
    case 'languageModelCall':
      _INTERNAL_skipAiProviderWrapping([WORKERS_AI_INTEGRATION_NAME]);

      return buildModelCallSpan(event, baseAttributes, recordInputs, callId, modelId);
    case 'executeTool':
      return buildToolSpan(event, recordInputs);
    case 'embed':
    case 'embedMany': {
      // `embed` carries a single `value`; `embedMany` a `values` array — both map to the embeddings input.
      const input = type === 'embedMany' ? event.values : event.value;
      return startGenAiSpan(GEN_AI_EMBEDDINGS_OPERATION, modelId, {
        ...baseAttributes,
        ...(recordInputs && input !== undefined ? { [GEN_AI_EMBEDDINGS_INPUT]: stringify(input) } : {}),
      });
    }
    case 'rerank':
      return startGenAiSpan(GEN_AI_RERANK_OPERATION, modelId, baseAttributes);
    default:
      // Unknown event type: opt out rather than open a span we can't shape correctly.
      return undefined;
  }
}

/** Start a `gen_ai.<operation>` span named `<operation> <suffix>` (or just `<operation>` when no suffix). */
function startGenAiSpan(operation: string, suffix: string | undefined, attributes: SpanAttributes): Span {
  return startInactiveSpan({
    name: suffix ? `${operation} ${suffix}` : operation,
    op: `gen_ai.${operation}`,
    attributes: { [GEN_AI_OPERATION_NAME]: operation, ...attributes },
  });
}

function buildInvokeAgentSpan(
  event: Record<string, unknown>,
  baseAttributes: SpanAttributes,
  recordInputs: boolean,
  callId: string | undefined,
  isStream: boolean,
): Span {
  const functionId = asString(event.functionId);
  const operationId = asString(event.operationId) ?? (isStream ? 'ai.streamText' : 'ai.generateText');
  if (callId) {
    operationIdByCallId.set(callId, { operationId, isStream });
  }
  const span = startGenAiSpan(GEN_AI_INVOKE_AGENT_OPERATION, functionId, {
    ...baseAttributes,
    [VERCEL_AI_OPERATION_ID_ATTRIBUTE]: operationId,
    [GEN_AI_RESPONSE_STREAMING]: isStream,
    ...(functionId ? { [GEN_AI_FUNCTION_ID]: functionId } : {}),
    ...(recordInputs ? buildInputMessageAttributes(event) : {}),
  });
  if (isStream && callId) {
    invokeAgentSpanByCallId.set(callId, span);
  }

  return span;
}

function buildModelCallSpan(
  event: Record<string, unknown>,
  baseAttributes: SpanAttributes,
  recordInputs: boolean,
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
    ...(recordInputs ? buildInputMessageAttributes(event) : {}),
    ...(recordInputs && Array.isArray(event.tools) ? { [GEN_AI_TOOL_DEFINITIONS]: stringify(event.tools) } : {}),
  });
}

function buildToolSpan(event: Record<string, unknown>, recordInputs: boolean): Span {
  const toolCall = isObjectLike(event.toolCall) ? event.toolCall : {};
  const toolName = asString(toolCall.toolName);
  const toolCallId = asString(event.toolCallId) ?? asString(toolCall.toolCallId);
  const toolInput = toolCall.input ?? toolCall.args;
  // The `executeTool` event has no description; backfill it from the operation's recorded tools.
  // Gated on `recordInputs` to match the OTel path (descriptions come from the recorded tools list).
  const description =
    recordInputs && toolName ? resolveToolDescription(asString(event.callId), toolName, event.tools) : undefined;
  return startGenAiSpan(GEN_AI_EXECUTE_TOOL_OPERATION, toolName, {
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
    ...(toolName ? { [GEN_AI_TOOL_NAME]: toolName } : {}),
    ...(toolCallId ? { [GEN_AI_TOOL_CALL_ID_ATTRIBUTE]: toolCallId } : {}),
    ...(description ? { [GEN_AI_TOOL_DESCRIPTION_ATTRIBUTE]: description } : {}),
    ...(recordInputs && toolInput !== undefined ? { [GEN_AI_TOOL_CALL_ARGUMENTS]: stringify(toolInput) } : {}),
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
  if (!isObjectLike(result)) {
    return;
  }

  const { recordOutputs } = getRecordingOptions(data.event, channelOptions);

  if (type === 'executeTool') {
    if (recordOutputs) {
      span.setAttribute(GEN_AI_TOOL_CALL_RESULT, stringify(result.output ?? result));
    }
    // From V5 on, tool errors are not rejected (so the `error` channel verb never fires) — they
    // surface as `tool-error` content on the resolved result. Mirror the OTel path by marking the
    // span and capturing the error.
    const output = isObjectLike(result.output) ? result.output : undefined;
    if (output?.type === 'tool-error') {
      captureToolError(span, data, output.error);
    }
    return;
  }

  // `languageModelCall` results report usage as `{ total }` objects; top-level/step results report
  // flat numbers. `tokenCount` handles both. v4 names tokens `promptTokens`/`completionTokens`
  // (v5+ uses `inputTokens`/`outputTokens`); the fallbacks are `undefined`-inert on v5+.
  const usage = isObjectLike(result.usage) ? result.usage : undefined;
  if (usage) {
    const inputTokens = tokenCount(usage.inputTokens) ?? tokenCount(usage.promptTokens) ?? tokenCount(usage.tokens);
    const outputTokens = tokenCount(usage.outputTokens) ?? tokenCount(usage.completionTokens);
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
    span.setAttribute(GEN_AI_RESPONSE_FINISH_REASONS, stringify([finishReason]));
  }

  const response = isObjectLike(result.response) ? result.response : undefined;
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
  if (GEN_AI_CONVERSATION_ID in providerAttributes && spanToJSON(span).attributes[GEN_AI_CONVERSATION_ID]) {
    // oxlint-disable-next-line typescript/no-dynamic-delete
    delete providerAttributes[GEN_AI_CONVERSATION_ID];
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
  return isObjectLike(finishReason) ? asString(finishReason.unified) : undefined;
}

/** Reads a token count that may be a plain number or a `{ total }` object (model-call usage). */
function tokenCount(value: unknown): number | undefined {
  return asNumber(value) ?? (isObjectLike(value) ? asNumber(value.total) : undefined);
}

function buildOutputMessages(
  parts: Array<Record<string, unknown>>,
  finishReason: string | undefined,
): string | undefined {
  if (!parts.length) {
    return undefined;
  }
  return stringify([{ role: 'assistant', parts, finish_reason: normalizeFinishReason(finishReason) }]);
}

function toolCallPart(toolCall: Record<string, unknown>): Record<string, unknown> {
  const args = toolCall.input ?? toolCall.args;
  return {
    type: 'tool_call',
    id: asString(toolCall.toolCallId),
    name: asString(toolCall.toolName),
    arguments: typeof args === 'string' ? args : stringify(args ?? {}),
  };
}

function partsFromContent(content: unknown[]): Array<Record<string, unknown>> {
  const parts: Array<Record<string, unknown>> = [];
  for (const item of content) {
    if (!isObjectLike(item)) {
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
      if (isObjectLike(toolCall)) {
        parts.push(toolCallPart(toolCall));
      }
    }
  }
  return parts;
}

export function captureToolError(span: Span, data: VercelAiChannelMessage, error: unknown): void {
  span.setStatus({
    code: SPAN_STATUS_ERROR,
    message: error instanceof Error ? error.message : 'tool_error',
  });

  const toolCall = isObjectLike(data.event.toolCall) ? data.event.toolCall : {};
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
} {
  const genAI = getClient()?.getDataCollectionOptions().genAI;

  return {
    recordInputs: resolveRecording(channelOptions.recordInputs, event.recordInputs, genAI?.inputs),
    recordOutputs: resolveRecording(channelOptions.recordOutputs, event.recordOutputs, genAI?.outputs),
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

function buildInputMessageAttributes(event: Record<string, unknown>): Record<string, string | number | undefined> {
  const attributes: Record<string, string | number | undefined> = {};

  // `ai` >= 7 forbids system messages in `messages`/`prompt` and exposes the system prompt as a
  // separate `instructions` field. The OTel path lifts the system message out of the prompt into
  // `gen_ai.system_instructions` as `[{ type: 'text', content }]`; mirror that shape here.
  const instructions = asString(event.instructions);
  if (instructions) {
    attributes[GEN_AI_SYSTEM_INSTRUCTIONS] = stringify([{ type: 'text', content: instructions }]);
  }

  // The AI SDK start events extend `StandardizedPrompt`; messages live on `messages`, otherwise the
  // simpler `prompt` field is used.
  const messages = event.messages ?? event.prompt;
  if (messages !== undefined) {
    attributes[GEN_AI_INPUT_MESSAGES] = stringify(messages);
  }

  return attributes;
}
