/* eslint-disable max-lines */
import type { Span } from '@sentry/core';
import { debug, getActiveSpan, isObjectLike, SPAN_STATUS_ERROR, withActiveSpan } from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';
import { CHANNELS } from '../orchestrion/channels';
import { bindTracingChannelToSpan, type TracingChannelPayloadWithSpan } from '../tracing-channel';
import {
  captureToolError,
  clearOperationCallId,
  clearOperationId,
  createSpanFromMessage,
  enrichSpanOnEnd,
  streamedResultToChannelResult,
  type VercelAiChannelMessage,
  type VercelAiChannelOptions,
  type VercelAiTracingChannelFactory,
} from './vercel-ai-dc-subscriber';
import { asString, isReadableStream, tapModelCallStream } from './util';

/**
 * v5 & v6 channel adapter for the Vercel AI (`ai`) SDK.
 *
 * `ai` >= 7 publishes a normalized `ai:telemetry` tracing channel natively
 * (consumed by `subscribeVercelAiTracingChannel`). v5/v6 have no such channel, so
 * orchestrion injects `orchestrion:ai:*` channels around the top-level
 * functions (see `orchestrion/config/index.ts`). The injected channels carry only the
 * wrapped call's `{ arguments, result, error }` — NOT v7's normalized `event`
 * object — so this adapter reconstructs an equivalent {@link VercelAiChannelMessage}
 * from v5/v6's argument/result shapes and delegates to the SAME span-building core
 * (`createSpanFromMessage` / `enrichSpanOnEnd`) the v7 subscriber uses, so the
 * emitted spans are identical between v5, v6 and v7.
 *
 * The model call (`languageModelCall` / `generate_content` span) has no
 * injectable definition in `ai`, so we instead wrap `resolveLanguageModel` (the
 * single chokepoint every model call flows through, present in both v5 and v6)
 * and monkey-patch `doGenerate`/`doStream` on the returned model.
 *
 * Tool-call spans differ by version: v6 exposes a per-call `executeToolCall`
 * function orchestrion wraps into its own channel. v5 has no such export (only a
 * batch `executeTools`), so instead we monkey-patch each tool's `execute` from
 * the operation's `tools`. On v6 that patch is inert: `executeToolCall` runs
 * `execute` inside its own tool-call span (the active async context), so the
 * patch sees that span as its parent and skips — only v5 (where the parent is
 * the enclosing `invoke_agent` span) emits the patched span, so v6 never
 * double-counts tool spans.
 */

/** Shape orchestrion's transform attaches to the tracing-channel context. */
interface OrchestrionContext {
  arguments: unknown[];
  result?: unknown;
  error?: unknown;
}

/** Builds the normalized message for a channel from the wrapped call's first-arg options. */
type MessageBuilder = (options: Record<string, unknown>, telemetry: Record<string, unknown>) => VercelAiChannelMessage;

/** A resolved `ai` language model — has `doGenerate`/`doStream` and identity fields. */
interface ResolvedModel {
  modelId?: string;
  provider?: string;
  doGenerate?: (...args: unknown[]) => Promise<unknown>;
  doStream?: (...args: unknown[]) => Promise<unknown>;
}

const PATCHED = Symbol('SentryVercelAiModelPatched');
const TOOL_PATCHED = Symbol('SentryVercelAiToolPatched');

/** A resolved model with our patch bookkeeping (idempotency flag). */
type PatchableModel = ResolvedModel & { [PATCHED]?: boolean };

/** A tool definition off an operation's `tools`, with our patch bookkeeping. */
type PatchableTool = { execute?: (...args: unknown[]) => unknown; [TOOL_PATCHED]?: boolean };

// Per-operation correlation id. No Date/random (unavailable / non-deterministic) — a counter is enough.
let callIdCounter = 0;
function nextCallId(): string {
  return `v6-${++callIdCounter}`;
}

// The message built on `start` for each operation, keyed by the (stable-identity) channel context, so
// the `beforeSpanEnd` handler can enrich the span from the settled result and clear the `callId` maps.
const messages = new WeakMap<object, VercelAiChannelMessage>();
// The spans we opened for top-level operations, and each one's `callId`. A model call resolves its
// parent against this set (so it never mis-attributes to the enclosing `main`/user span) and reads the
// parent's `callId` so its span can be named after the operation (e.g. `ai.streamText.doStream`).
const operationSpans = new WeakSet<Span>();
// Tool-call spans — only v6's `executeToolCall` channel opens these. The v5 tool-`execute` patch
// consults this to avoid double-counting: `executeToolCall` runs `execute` inside its span (which is
// therefore the active parent), so a resolved parent in this set means v6 already spanned the call.
const toolCallSpans = new WeakSet<Span>();
const callIdBySpan = new WeakMap<Span, string>();
// The operation's per-call recording flags (`experimental_telemetry.recordInputs/recordOutputs`), keyed by
// its span. A model call carries no telemetry of its own, so it inherits the enclosing operation's flags —
// otherwise a per-call `recordInputs: true` would record inputs on the `invoke_agent` span but not on the
// child `generate_content` span (whose event would fall back to the global default). v7's channel forwards
// these flags on every event, so this keeps v6 identical.
const recordingBySpan = new WeakMap<Span, ReturnType<typeof recording>>();

// The `experimental_telemetry` objects we swapped in to suppress `ai`'s native OTel spans (see
// `suppressNativeTelemetry`). Our skip logic treats `isEnabled === false` as "user disabled telemetry,
// emit no span"; without this set, a call whose options object we already neutralized — or a user-shared
// telemetry object we replaced on a prior call — would be misread as user-disabled and lose its span.
const suppressedTelemetry = new WeakSet<object>();

let subscribed = false;

/**
 * Subscribe the v6 orchestrion channel adapter. Safe to always call: inert on
 * `ai` >= 7 (those channels are never published) and when orchestrion injection
 * isn't active. Idempotent.
 *
 * `tracingChannel` is the platform-provided factory (the same one passed to
 * `subscribeVercelAiTracingChannel`); `options` pins the recording settings at
 * subscribe time so we never look the integration up per event.
 */
export function subscribeVercelAiOrchestrionChannels(
  tracingChannel: VercelAiTracingChannelFactory,
  options: VercelAiChannelOptions = {},
): void {
  if (subscribed) {
    return;
  }
  subscribed = true;

  try {
    bindOperation(tracingChannel, CHANNELS.VERCEL_AI_GENERATE_TEXT, buildTextMessage('generateText'), options);
    bindOperation(tracingChannel, CHANNELS.VERCEL_AI_STREAM_TEXT, buildTextMessage('streamText'), options);
    bindOperation(
      tracingChannel,
      CHANNELS.VERCEL_AI_EMBED,
      (callOptions, telemetry) => ({
        type: 'embed',
        event: {
          callId: nextCallId(),
          ...modelFields(callOptions.model),
          maxRetries: callOptions.maxRetries,
          value: callOptions.value,
          ...recording(telemetry),
        },
      }),
      options,
    );
    bindOperation(
      tracingChannel,
      CHANNELS.VERCEL_AI_EMBED_MANY,
      // `embedMany` takes a `values` array (vs `embed`'s single `value`); the shared core reads it as the
      // embeddings input, matching the OTel path's batch `ai.embedMany` span.
      (callOptions, telemetry) => ({
        type: 'embedMany',
        event: {
          callId: nextCallId(),
          ...modelFields(callOptions.model),
          maxRetries: callOptions.maxRetries,
          values: callOptions.values,
          ...recording(telemetry),
        },
      }),
      options,
    );
    bindOperation(
      tracingChannel,
      CHANNELS.VERCEL_AI_EXECUTE_TOOL_CALL,
      (callOptions, telemetry) => ({
        type: 'executeTool',
        // v6 carries the tool definitions on the executeToolCall args (a record keyed by name);
        // the shared core reads the matching tool's `description` for the span.
        event: {
          callId: nextCallId(),
          toolCall: callOptions.toolCall,
          tools: callOptions.tools,
          ...recording(telemetry),
        },
      }),
      options,
    );
    subscribeResolveLanguageModel(tracingChannel, CHANNELS.VERCEL_AI_RESOLVE_LANGUAGE_MODEL, options);
  } catch {
    DEBUG_BUILD && debug.log('Vercel AI orchestrion channel subscription failed.');
  }
}

/**
 * Bind one operation channel: `getSpan` opens a span from the message reconstructed out of the wrapped
 * call's first argument; `beforeSpanEnd` enriches it from the settled result (tokens, output messages,
 * finish reasons, …) before the helper ends the span.
 *
 * An operation whose `experimental_telemetry.isEnabled` is explicitly `false` is skipped entirely (no
 * span): the orchestrion channel fires regardless of that flag, whereas v7's native `ai:telemetry`
 * channel is simply not published in that case — so we reproduce v7's "no telemetry → no span".
 */
function bindOperation(
  tracingChannel: VercelAiTracingChannelFactory,
  channelName: string,
  build: MessageBuilder,
  options: VercelAiChannelOptions,
): void {
  const channel = tracingChannel<OrchestrionContext>(channelName);

  // Build the operation span from the wrapped call's first argument and track it (so a model call can
  // resolve it as its parent). `bindTracingChannelToSpan` calls this once at channel `start` and makes
  // the returned span the active async context for the operation's duration — that active span is what
  // `resolveModelCallParent` reads. It also sets `data._sentrySpan`, so we don't here.
  const buildOperationSpan = (data: TracingChannelPayloadWithSpan<OrchestrionContext>): Span | undefined => {
    const callOptions = isObjectLike(data.arguments[0]) ? data.arguments[0] : {};
    const telemetry = isObjectLike(callOptions.experimental_telemetry) ? callOptions.experimental_telemetry : {};
    // `isEnabled === false` means the user opted out — emit no span. But `isEnabled` is also `false` on
    // the telemetry object we swap in to suppress native spans, so don't mistake our own object for a
    // user opt-out (which would drop the span on a call whose options we already neutralized).
    if (telemetry.isEnabled === false && !suppressedTelemetry.has(telemetry)) {
      return undefined;
    }
    const message = build(callOptions, telemetry);
    // Stop `ai` from emitting its own native OTel spans for this call — we build the equivalent spans
    // from the channels, so the SDK's would be duplicates. Reads above have already captured everything
    // we need off `telemetry`.
    suppressNativeTelemetry(callOptions, telemetry);
    const span = createSpanFromMessage(message, options);
    if (span) {
      messages.set(data, message);
      operationSpans.add(span);
      // v6's `executeToolCall` span: tracked so the v5 tool-`execute` patch can recognize (and skip)
      // tool calls it runs, since that patch sees this span as its active parent (see `patchToolExecute`).
      if (message.type === 'executeTool') {
        toolCallSpans.add(span);
      }
      const callId = asString(message.event.callId);
      if (callId) {
        callIdBySpan.set(span, callId);
      }
      recordingBySpan.set(span, recording(telemetry));
      // v5 has no `executeToolCall` channel, so patch each tool's `execute` to emit the tool-call span.
      // Inert on v6 (guarded inside `patchToolExecute` when the parent is `executeToolCall`'s own span).
      if (isObjectLike(callOptions.tools)) {
        patchOperationTools(callOptions.tools, options);
      }
    }
    return span;
  };

  bindTracingChannelToSpan(
    channel,
    (data: TracingChannelPayloadWithSpan<OrchestrionContext>) => buildOperationSpan(data),
    {
      beforeSpanEnd: (span, data) => {
        const message = messages.get(data);
        if (!message) {
          return;
        }
        // The helper's `error` handler already set the span status; only enrich from a successful result.
        if (!('error' in data)) {
          // v6's `executeToolCall` returns the tool result/error object directly, whereas the shared core
          // (matching v7) expects it nested under `output`; wrap it so tool-error detection works.
          message.result = message.type === 'executeTool' ? { output: data.result } : data.result;
          enrichSpanOnEnd(span, message, options);
        }
        // A `streamText` model call runs after this (synchronously-returning) operation's span has
        // already ended, so its `callId` entry must outlive the operation — it's cleared once the model
        // call settles (see `patchModelMethod`). Every other operation can clear here.
        if (message.type !== 'streamText') {
          clearOperationId(message);
        }
        messages.delete(data);
      },
      // `streamText` returns synchronously, so its operation span would otherwise end before the stream
      // drains — losing the aggregate usage/output. Defer the end and await the result's completion
      // promises (`totalUsage`/`text`/…, which resolve on drain), mirroring how v7's channel defers the
      // operation span on the SDK's total-usage promise.
      deferSpanEnd: ({ data, end }) => deferStreamTextOperationEnd(data, end),
    },
  );
}

/**
 * Keep a streamed `streamText` operation span open until the stream drains, then enrich it from the
 * `StreamTextResult`'s completion promises (usage/output/finish reason) and end it. Returns `false` for
 * anything that isn't a streamed `streamText` result, so the helper ends the span as usual.
 */
function deferStreamTextOperationEnd(
  data: TracingChannelPayloadWithSpan<OrchestrionContext>,
  end: (error?: unknown) => void,
): boolean {
  if (messages.get(data)?.type !== 'streamText' || 'error' in data || !isStreamingResult(data.result)) {
    return false;
  }

  const streamResult = data.result;
  void (async () => {
    try {
      const [usage, text, toolCalls, finishReason, response] = await Promise.all([
        streamResult.totalUsage ?? streamResult.usage,
        streamResult.text,
        streamResult.toolCalls,
        streamResult.finishReason,
        streamResult.response,
      ]);
      // Feed the resolved values back through the shared enrichment: `beforeSpanEnd` reads `data.result`.
      data.result = { usage, text, toolCalls, finishReason, response };
      end();
    } catch (error) {
      end(error);
    }
  })();

  return true;
}

/** A `StreamTextResult` exposes its aggregates as promises (`totalUsage`/`usage`); a settled result does not. */
function isStreamingResult(result: unknown): result is Record<string, PromiseLike<unknown> | undefined> {
  return isObjectLike(result) && (isThenable(result.totalUsage) || isThenable(result.usage));
}

function isThenable(value: unknown): boolean {
  return isObjectLike(value) && typeof value.then === 'function';
}

/**
 * Neutralize `ai`'s native OpenTelemetry instrumentation for this call by pointing
 * `experimental_telemetry` at a copy with `isEnabled: false`. `ai`'s `getTracer` then returns its
 * internal no-op tracer, so it never creates (nor sets active) the duplicate `ai.*` spans we'd
 * otherwise have to drop.
 *
 * Only a call that explicitly enabled telemetry emits native spans — otherwise `ai` already uses its
 * no-op tracer, so there's nothing to suppress and we leave the user's options untouched. When
 * `isEnabled === true`, `telemetry` is `callOptions.experimental_telemetry` and `callOptions` is the
 * real first argument the SDK will read, so the reassignment takes effect for the wrapped call. We
 * replace rather than mutate in place, so a telemetry object the user shares across calls keeps its own
 * `isEnabled: true`; the replacement is tracked in `suppressedTelemetry` so our skip logic doesn't
 * later read it back as a user opt-out.
 */
function suppressNativeTelemetry(callOptions: Record<string, unknown>, telemetry: Record<string, unknown>): void {
  if (telemetry.isEnabled !== true) {
    return;
  }
  const suppressed = { ...telemetry, isEnabled: false };
  suppressedTelemetry.add(suppressed);
  callOptions.experimental_telemetry = suppressed;
}

/**
 * `resolveLanguageModel` returns the model every call flows through. We don't span it — on `end` we
 * monkey-patch `doGenerate`/`doStream` on the returned model so each invocation produces a
 * `languageModelCall` span parented to the enclosing invoke_agent span.
 */
function subscribeResolveLanguageModel(
  tracingChannel: VercelAiTracingChannelFactory,
  channelName: string,
  options: VercelAiChannelOptions,
): void {
  tracingChannel<OrchestrionContext>(channelName).subscribe({
    end(rawCtx) {
      const ctx = rawCtx as OrchestrionContext;
      if (!isObjectLike(ctx.result)) {
        return;
      }
      const model = ctx.result as PatchableModel;
      // Patch the model's `doGenerate`/`doStream` once. The model call recovers its parent from the
      // active async context at call time (the operation span `bindTracingChannelToSpan` bound), which
      // propagates into the model call for `streamText` too, so there is nothing to capture on the model here.
      if (!model[PATCHED]) {
        model[PATCHED] = true;
        patchModelMethod(model, 'doGenerate', options);
        patchModelMethod(model, 'doStream', options);
      }
    },
    start() {
      /* no-op */
    },
    asyncStart() {
      /* no-op */
    },
    asyncEnd() {
      /* no-op */
    },
    error() {
      /* no-op */
    },
  });
}

/**
 * Pick the invoke_agent span a model call should hang under: the operation span that
 * `bindTracingChannelToSpan` planted as the active async context for the enclosing operation.
 *
 * Because we suppress `ai`'s native telemetry (so it never installs its own span as active), the active
 * span inside `doGenerate`/`doStream` is our operation span. The `operationSpans` gate makes this return
 * `undefined` when the active span isn't one of ours — e.g. telemetry was disabled for the call so we
 * opened no operation span and the active span is the user's enclosing span — so the model call is
 * skipped rather than mis-parented.
 *
 * This covers `generateText`/`embed` (whose model call is awaited inside the operation body) and
 * `streamText` alike — `ai` initiates the stream synchronously within the operation's bound context, so
 * the later `doStream` continuation restores the same active span even though the operation's span has
 * already ended. The per-operation binding also disambiguates concurrent calls that share one model
 * instance (a single mutable slot on the shared model could not — it would hold whichever operation
 * resolved the model last).
 */
function resolveModelCallParent(): Span | undefined {
  const active = getActiveSpan();
  return active && operationSpans.has(active) ? active : undefined;
}

function patchModelMethod(
  model: PatchableModel,
  method: 'doGenerate' | 'doStream',
  options: VercelAiChannelOptions,
): void {
  const original = model[method];
  if (typeof original !== 'function') {
    return;
  }
  model[method] = function (this: unknown, ...args: unknown[]): Promise<unknown> {
    const parent = resolveModelCallParent();
    // No enclosing operation span (e.g. telemetry disabled for the call) → don't open a model-call span.
    if (!parent) {
      return Promise.resolve(original.apply(this, args));
    }

    const callArgs = isObjectLike(args[0]) ? args[0] : {};
    // Carry the operation's `callId` so the shared core can name the span after it
    // (`ai.generateText.doGenerate` / `ai.streamText.doStream`).
    const callId = callIdBySpan.get(parent);
    const message: VercelAiChannelMessage = {
      type: 'languageModelCall',
      event: {
        callId,
        provider: model.provider,
        modelId: model.modelId,
        tools: callArgs.tools,
        messages: callArgs.prompt,
        // Inherit the enclosing operation's per-call recording flags so inputs/tools/outputs are recorded on
        // the model-call span whenever they are on the parent `invoke_agent` span.
        ...recordingBySpan.get(parent),
      },
    };
    const span = withActiveSpan(parent, () => createSpanFromMessage(message, options));
    // `languageModelCall` always opens a span; the guard just keeps the wrapper safe if that changes.
    if (!span) {
      return Promise.resolve(original.apply(this, args));
    }

    // `streamText` ends its operation span synchronously, so its `callId` entry was deliberately left in
    // place for this later model call; drop it now that we've used it.
    const clearStreamCallId = (): void => {
      if (method === 'doStream' && callId) {
        clearOperationCallId(callId);
      }
    };

    // Both the synchronous throw and the async rejection of the model call must end the span with an
    // error status (an `async` `doGenerate`/`doStream` that throws rejects rather than throwing here).
    const failSpan = (error: unknown): never => {
      span.setStatus({ code: SPAN_STATUS_ERROR, message: error instanceof Error ? error.message : 'unknown_error' });
      span.end();
      clearStreamCallId();
      throw error;
    };

    try {
      const result = Promise.resolve(original.apply(this, args));
      return result.then(value => {
        // A streamed model call resolves to `{ stream, ... }` before the stream is consumed, so its
        // usage/finish/output only arrive as the stream drains. Tap it (same helper as the v7 path) and
        // defer ending this model-call span until then. The parent `invoke_agent` span is enriched
        // separately by `deferStreamTextOperationEnd`, which awaits the operation's own result promises.
        if (method === 'doStream' && isObjectLike(value) && isReadableStream(value.stream)) {
          value.stream = tapModelCallStream(
            value.stream,
            final => {
              message.result = { ...value, ...streamedResultToChannelResult(final) };
              enrichSpanOnEnd(span, message, options);
              span.end();
              clearStreamCallId();
            },
            error => {
              span.setStatus({
                code: SPAN_STATUS_ERROR,
                message: error instanceof Error ? error.message : 'unknown_error',
              });
              span.end();
              clearStreamCallId();
            },
          );

          return value;
        }
        // `doGenerate` (and any non-stream result) settles with the full result; end here, start/end
        // bracket the call to match the channel timing.
        message.result = value;
        enrichSpanOnEnd(span, message, options);
        span.end();
        clearStreamCallId();

        return value;
      }, failSpan);
    } catch (error) {
      return failSpan(error);
    }
  };
}

/**
 * Patch every executable tool on an operation's `tools` (a record keyed by tool name) so each
 * invocation emits a `gen_ai.execute_tool` span. v5 routes tool execution through the batch
 * `executeTools`, which binds `tool.execute` at call time — so replacing the `execute` property here
 * (before the call runs) is picked up. Tools without an `execute` (client-side tools) are skipped,
 * matching `executeTools`.
 */
function patchOperationTools(tools: Record<string, unknown>, options: VercelAiChannelOptions): void {
  // This runs inside the channel `start` transform (no upstream try/catch), so a throw here would break
  // the user's `ai` call. Instrumentation must never do that — degrade to no tool span instead.
  try {
    for (const [toolName, tool] of Object.entries(tools)) {
      if (isObjectLike(tool)) {
        patchToolExecute(toolName, tool as PatchableTool, tools, options);
      }
    }
  } catch {
    DEBUG_BUILD && debug.log('Vercel AI orchestrion tool patching failed.');
  }
}

function patchToolExecute(
  toolName: string,
  tool: PatchableTool,
  tools: Record<string, unknown>,
  options: VercelAiChannelOptions,
): void {
  const original = tool.execute;
  if (typeof original !== 'function' || tool[TOOL_PATCHED]) {
    return;
  }
  tool[TOOL_PATCHED] = true;
  tool.execute = function (this: unknown, input: unknown, ...rest: unknown[]): unknown {
    // Skip if there's no enclosing operation span (telemetry disabled for the call), or if that parent
    // is itself a tool-call span — the latter means v6's `executeToolCall` already opened a span for
    // this call and is running `execute` inside it, so spanning again here would double-count. On v5
    // the parent is the enclosing `invoke_agent` operation span, so we proceed.
    const parent = resolveModelCallParent();
    if (!parent || toolCallSpans.has(parent)) {
      return original.apply(this, [input, ...rest]);
    }

    // v5 passes `{ toolCallId, messages, abortSignal, ... }` as the second argument to `execute`.
    const callOptions = isObjectLike(rest[0]) ? rest[0] : {};
    const message: VercelAiChannelMessage = {
      type: 'executeTool',
      event: {
        callId: callIdBySpan.get(parent),
        toolCall: { toolName, toolCallId: asString(callOptions.toolCallId), input },
        // The `tools` record (keyed by name) lets the shared core backfill the tool's `description`.
        tools,
        // Inherit the enclosing operation's per-call recording flags so tool inputs/outputs are recorded
        // whenever they are on the parent `invoke_agent` span.
        ...recordingBySpan.get(parent),
      },
    };
    const span = withActiveSpan(parent, () => createSpanFromMessage(message, options));
    // `executeTool` always opens a span; the guard just keeps the wrapper safe if that changes.
    if (!span) {
      return original.apply(this, [input, ...rest]);
    }

    // v5's `executeTools` catches a thrown tool error and turns it into `tool-error` content rather
    // than rejecting, so the user never sees a rejection — we must capture it here. Rethrow so
    // `executeTools` still produces its `tool-error` result and the operation continues normally.
    const failSpan = (error: unknown): never => {
      captureToolError(span, message, error);
      span.end();
      throw error;
    };

    try {
      const result = Promise.resolve(original.apply(this, [input, ...rest]));
      return result.then(value => {
        // The shared core (matching v6/v7) expects the tool result nested under `output`.
        message.result = { output: value };
        enrichSpanOnEnd(span, message, options);
        span.end();
        return value;
      }, failSpan);
    } catch (error) {
      return failSpan(error);
    }
  };
}

function buildTextMessage(type: 'generateText' | 'streamText'): MessageBuilder {
  return (options, telemetry) => ({
    type,
    event: {
      callId: nextCallId(),
      operationId: `ai.${type}`,
      functionId: asString(telemetry.functionId),
      ...modelFields(options.model),
      maxRetries: options.maxRetries,
      // Normalize to the message-array shape the shared core (and v7's channel) expects: a bare string
      // `prompt` becomes a single user message, matching the SDK's own normalization.
      messages: normalizePromptMessages(options),
      ...recording(telemetry),
    },
  });
}

function normalizePromptMessages(options: Record<string, unknown>): unknown {
  if (Array.isArray(options.messages)) {
    return options.messages;
  }
  if (typeof options.prompt === 'string') {
    return [{ role: 'user', content: options.prompt }];
  }
  return options.messages ?? options.prompt;
}

function recording(telemetry: Record<string, unknown>): { recordInputs: unknown; recordOutputs: unknown } {
  // Match the OTel integration's per-call default: an explicit `recordInputs`/`recordOutputs` wins, but a
  // call that merely enables telemetry (`isEnabled: true`, no explicit flags) defaults both to `true`.
  // Unlike v7's native `ai:telemetry` channel, the orchestrion channels expose `isEnabled`, so — as noted
  // in `resolveRecording` — we CAN reproduce that default here (the native-channel subscriber cannot).
  const enabledDefault = telemetry.isEnabled === true ? true : undefined;
  return {
    recordInputs: telemetry.recordInputs ?? enabledDefault,
    recordOutputs: telemetry.recordOutputs ?? enabledDefault,
  };
}

function modelFields(model: unknown): { provider?: string; modelId?: string } {
  return { provider: modelField(model, 'provider'), modelId: modelField(model, 'modelId') };
}

function modelField(model: unknown, field: 'modelId' | 'provider'): string | undefined {
  return isObjectLike(model) ? asString(model[field]) : undefined;
}
