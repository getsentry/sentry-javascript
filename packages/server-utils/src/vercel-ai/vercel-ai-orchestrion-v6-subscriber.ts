import { AsyncLocalStorage } from 'node:async_hooks';
import type { Span } from '@sentry/core';
import { debug, SPAN_STATUS_ERROR, withActiveSpan } from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';
import { CHANNELS } from '../orchestrion/channels';
import { bindTracingChannelToSpan, type TracingChannelPayloadWithSpan } from '../tracing-channel';
import {
  clearOperationCallId,
  clearOperationId,
  createSpanFromMessage,
  enrichSpanOnEnd,
  type VercelAiChannelMessage,
  type VercelAiChannelOptions,
  type VercelAiTracingChannelFactory,
} from './vercel-ai-dc-subscriber';

/**
 * v6 channel adapter for the Vercel AI (`ai`) SDK.
 *
 * `ai` >= 7 publishes a normalized `ai:telemetry` tracing channel natively
 * (consumed by `subscribeVercelAiTracingChannel`). v6 has no such channel, so
 * orchestrion injects `orchestrion:ai:*` channels around the top-level
 * functions (see `orchestrion/config.ts`). The injected channels carry only the
 * wrapped call's `{ arguments, result, error }` — NOT v7's normalized `event`
 * object — so this adapter reconstructs an equivalent {@link VercelAiChannelMessage}
 * from v6's argument/result shapes and delegates to the SAME span-building core
 * (`createSpanFromMessage` / `enrichSpanOnEnd`) the v7 subscriber uses, so the
 * emitted spans are identical between v6 and v7.
 *
 * Like the v7 subscriber, each operation channel is wired up via
 * {@link bindTracingChannelToSpan}, which binds the opened span into the runtime's
 * async context for the duration of the traced call and ends it when the call
 * settles. That binding is what lets the model call below find its enclosing
 * `invoke_agent` span via the active context (see {@link resolveModelCallParent}).
 *
 * The model call (`languageModelCall` / `generate_content` span) has no
 * injectable definition in `ai`, so we instead wrap `resolveLanguageModel` (the
 * single chokepoint every model call flows through) and monkey-patch
 * `doGenerate`/`doStream` on the returned model.
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

/** A resolved model with our patch bookkeeping (idempotency flag). */
type PatchableModel = ResolvedModel & { [PATCHED]?: boolean };

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
const callIdBySpan = new WeakMap<Span, string>();
// Carries the enclosing operation span down to the patched `doGenerate`/`doStream`, where the active
// span is the `ai` SDK's own (ignored) model-call span rather than our operation span. It's bound onto
// the operation channel via `bindStore` (see `bindOperation`), so it's scoped per traced operation and
// propagates across the awaits inside it. This holds for `streamText` too: `ai` initiates the model
// stream synchronously inside `streamText` (within this bound context), so the later `doStream` — even
// though it runs after the operation's span has already ended — still restores this store and reads ITS
// operation's span. That per-operation scoping is the sole parent-resolution mechanism, and it is what
// keeps concurrent operations sharing a single model instance from cross-attributing their model calls.
const operationParentStore = new AsyncLocalStorage<Span | undefined>();

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

  // Bind the operation span into our own async-context store. We bind it BEFORE `bindTracingChannelToSpan`
  // so that — bound stores run last-in-first-out — this transform runs AFTER the helper's producer has
  // stashed the span on `data._sentrySpan`. `bindStore` activates the store via `runStores` for the
  // traced operation, and that propagates across the awaits inside it, so a model call awaited within the
  // operation reads ITS operation's span — no leak across sequential calls, no clobbering across
  // concurrent ones (which a single mutable slot on the shared model instance cannot achieve).
  // `bindStore`'s store type is the channel's data type; our store value is the operation span, so cast
  // (the runtime treats the store value opaquely — same as `bindTracingChannelToSpan` does internally).
  channel.start.bindStore(operationParentStore as unknown as AsyncLocalStorage<OrchestrionContext>, data => {
    return (data as TracingChannelPayloadWithSpan<OrchestrionContext>)._sentrySpan as unknown as OrchestrionContext;
  });

  bindTracingChannelToSpan(
    channel,
    (data: TracingChannelPayloadWithSpan<OrchestrionContext>) => {
      const callOptions = isRecord(data.arguments[0]) ? data.arguments[0] : {};
      const telemetry = isRecord(callOptions.experimental_telemetry) ? callOptions.experimental_telemetry : {};
      if (telemetry.isEnabled === false) {
        return undefined;
      }
      const message = build(callOptions, telemetry);
      const span = createSpanFromMessage(message, options);
      if (span) {
        messages.set(data, message);
        operationSpans.add(span);
        const callId = asString(message.event.callId);
        if (callId) {
          callIdBySpan.set(span, callId);
        }
      }
      return span;
    },
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
    },
  );
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
      if (!isRecord(ctx.result)) {
        return;
      }
      const model = ctx.result as PatchableModel;
      // Patch the model's `doGenerate`/`doStream` once. The model call recovers its parent from
      // `operationParentStore` at call time (set per-operation by `bindOperation`), which propagates into
      // the model call for `streamText` too, so there is nothing to capture on the model here.
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
 * Pick the invoke_agent span a model call should hang under: the operation span bound onto
 * `operationParentStore` for the enclosing operation.
 *
 * This covers `generateText`/`embed` (whose model call is awaited inside the operation body) and
 * `streamText` alike — `ai` initiates the stream synchronously within the operation's bound context, so
 * `doStream` restores the same per-operation store even though it runs after the operation's span has
 * ended. Being per-operation, the store disambiguates concurrent calls that share one model instance (a
 * single mutable slot on the shared model could not — it would hold whichever operation resolved the
 * model last). Returns `undefined` when the store doesn't carry an operation span — e.g. telemetry was
 * disabled for the enclosing call — so the model call is skipped too.
 */
function resolveModelCallParent(): Span | undefined {
  const fromContext = operationParentStore.getStore();
  return fromContext && operationSpans.has(fromContext) ? fromContext : undefined;
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

    const callArgs = isRecord(args[0]) ? args[0] : {};
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

    let result: Promise<unknown>;
    try {
      result = Promise.resolve(original.apply(this, args));
    } catch (error) {
      span.setStatus({ code: SPAN_STATUS_ERROR, message: error instanceof Error ? error.message : 'unknown_error' });
      span.end();
      clearStreamCallId();
      throw error;
    }
    // `doStream` resolves to `{ stream, ... }` before the stream is consumed; we end here (start/end
    // bracket the call) to match the channel timing.
    return result.then(
      value => {
        message.result = value;
        enrichSpanOnEnd(span, message, options);
        span.end();
        clearStreamCallId();
        return value;
      },
      error => {
        span.setStatus({ code: SPAN_STATUS_ERROR, message: error instanceof Error ? error.message : 'unknown_error' });
        span.end();
        clearStreamCallId();
        throw error;
      },
    );
  };
}

function buildTextMessage(type: 'generateText' | 'streamText'): MessageBuilder {
  return (options, telemetry) => ({
    type,
    event: {
      callId: nextCallId(),
      operationId: type === 'streamText' ? 'ai.streamText' : 'ai.generateText',
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
  return { recordInputs: telemetry.recordInputs, recordOutputs: telemetry.recordOutputs };
}

function modelFields(model: unknown): { provider?: string; modelId?: string } {
  return { provider: modelField(model, 'provider'), modelId: modelField(model, 'modelId') };
}

function modelField(model: unknown, field: 'modelId' | 'provider'): string | undefined {
  return isRecord(model) ? asString(model[field]) : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
