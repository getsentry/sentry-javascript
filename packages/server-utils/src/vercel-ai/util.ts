/** Shared, state-free helpers for the Vercel AI (`ai`) channel subscribers, plus the streamed model-call tap. */

import { isObjectLike } from '@sentry/core';

/** Narrow to a string, or `undefined` for anything else. */
export function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** Narrow to a finite number, or `undefined` for anything else (including `NaN`). */
export function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && !isNaN(value) ? value : undefined;
}

/** Add two optional numbers, treating a missing operand as `0` but returning `undefined` when both are absent. */
export function sum(a: number | undefined, b: number | undefined): number | undefined {
  return a === undefined && b === undefined ? undefined : (a ?? 0) + (b ?? 0);
}

/** Stringify a value, passing strings through and falling back to a placeholder on circular/unserializable input. */
export function safeStringify(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return '[unserializable]';
  }
}

/*
 * Streaming support for the `ai:telemetry` tracing channel.
 *
 * For a streamed model call (`doStream`) the SDK resolves the `languageModelCall` channel promise as
 * soon as it hands back the *unconsumed* stream — so `result.stream` is a `ReadableStream` and the
 * final usage / finish reason / output only arrive later, as the stream is drained (they ride the
 * stream's own `finish`/`text-delta`/`tool-call` chunks, never the channel context). The SDK
 * deliberately leaves `result` undefined on the `streamText`/`step` contexts and exposes the stream
 * only on the model call, expecting consumers to tap it themselves.
 * @see https://github.com/vercel/ai/pull/15660 (discussion: "tee off and aggregate ourselves")
 *
 * We replace `result.stream` with a passthrough that forwards every chunk untouched (so the SDK's own
 * consumption is unaffected) while accumulating the data we need, then hand the aggregate back once the
 * stream settles so the model-call span can be enriched and ended out-of-band.
 */

/** The subset of a streamed provider chunk we read. Unknown chunk types are forwarded and ignored. */
interface StreamChunk {
  type?: unknown;
  delta?: unknown;
  id?: unknown;
  modelId?: unknown;
  toolCallId?: unknown;
  toolName?: unknown;
  input?: unknown;
  args?: unknown;
  finishReason?: unknown;
  usage?: unknown;
  providerMetadata?: unknown;
  error?: unknown;
}

/** The aggregate handed back once a streamed model call finishes, in the shape `enrichSpanOnEnd` expects. */
export interface StreamedModelCallResult {
  text?: string;
  toolCalls: Array<Record<string, unknown>>;
  usage?: unknown;
  finishReason?: unknown;
  responseId?: string;
  responseModel?: string;
  providerMetadata?: unknown;
}

/** A minimal structural check — the streamed model call exposes a web `ReadableStream` on `result.stream`. */
export function isReadableStream(value: unknown): value is ReadableStream<unknown> {
  return (
    isObjectLike(value) &&
    typeof (value as { pipeThrough?: unknown }).pipeThrough === 'function' &&
    typeof (value as { getReader?: unknown }).getReader === 'function'
  );
}

/**
 * Wrap a streamed model call's `ReadableStream` so its chunks are observed as the SDK consumes them,
 * without altering what the SDK sees. Returns a replacement stream to swap onto `result.stream`.
 *
 * `onFinal` runs exactly once when the stream drains cleanly; `onError` runs exactly once if it errors
 * or is cancelled. Reading one source chunk per `pull` preserves the SDK's backpressure. The
 * `try/catch` around every read guarantees the owning span is always ended — a leaked open span on a
 * mid-stream failure would be worse than a slightly-less-enriched one.
 */
export function tapModelCallStream(
  stream: ReadableStream<unknown>,
  onFinal: (result: StreamedModelCallResult) => void,
  onError: (error: unknown) => void,
): ReadableStream<unknown> {
  const reader = stream.getReader();
  const state: StreamedModelCallResult = { toolCalls: [] };
  let text = '';
  let settled = false;

  const finalize = (): void => {
    if (settled) {
      return;
    }
    settled = true;
    if (text) {
      state.text = text;
    }
    onFinal(state);
  };

  const fail = (error: unknown): void => {
    if (settled) {
      return;
    }
    settled = true;
    onError(error);
  };

  return new ReadableStream<unknown>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          finalize();
          controller.close();

          return;
        }
        text += accumulateChunk(state, value) ?? '';
        controller.enqueue(value);
      } catch (error) {
        fail(error);
        controller.error(error);
      }
    },
    cancel(reason) {
      // Consumer stopped reading early (e.g. a `break` out of `for await`); close out the span with
      // whatever we have rather than leave it open. A non-error reason is a deliberate stop, not a failure.
      finalize();

      return reader.cancel(reason);
    },
  });
}

/**
 * Fold a single streamed chunk into the running aggregate. Returns any text delta so the caller can
 * accumulate it (kept out of `state` until the end to avoid re-joining on every chunk).
 */
function accumulateChunk(state: StreamedModelCallResult, chunk: unknown): string | undefined {
  if (!isObjectLike(chunk)) {
    return undefined;
  }
  const { type, delta, id, modelId, toolCallId, toolName, input, args, finishReason, usage, providerMetadata } =
    chunk as StreamChunk;

  switch (type) {
    case 'text-delta':
      return typeof delta === 'string' ? delta : undefined;
    case 'tool-call':
      state.toolCalls.push({ toolCallId, toolName, input: input ?? args });

      return undefined;
    case 'response-metadata':
      if (typeof id === 'string') {
        state.responseId = id;
      }
      if (typeof modelId === 'string') {
        state.responseModel = modelId;
      }

      return undefined;
    case 'finish':
      state.finishReason = finishReason;
      state.usage = usage;
      if (providerMetadata !== undefined) {
        state.providerMetadata = providerMetadata;
      }

      return undefined;
    default:
      return undefined;
  }
}
