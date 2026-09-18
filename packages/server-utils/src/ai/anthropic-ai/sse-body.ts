import type { Span } from '@sentry/core';
import { endStreamSpan } from '../core/utils';
import { createStreamingState, processEvent } from './streaming';
import type { AnthropicAiStreamingEvent } from './types';

/** The slice of a stream controller the SSE pass-through uses, shared by the byte and default variants. */
interface SseStreamController {
  enqueue: (chunk: Uint8Array) => void;
  close: () => void;
  error: (reason?: unknown) => void;
}

/** Walks the prototype chain for a getter, so a shadowing own property doesn't hide the original. */
function findBoundGetter(target: object, key: string): (() => unknown) | undefined {
  for (let proto = Object.getPrototypeOf(target); proto; proto = Object.getPrototypeOf(proto)) {
    const descriptor = Object.getOwnPropertyDescriptor(proto, key);
    if (descriptor?.get) {
      return descriptor.get.bind(target);
    }
  }
  return undefined;
}

/**
 * Replace `response.body` with a pass-through that accumulates the SSE frames flowing through it and
 * ends `span` once the body is exhausted, cancelled or errors.
 *
 * Every way of draining an Anthropic stream bottoms out in `response.body`: the SDK `Stream`'s async
 * iterator, `tee()`, and a caller reading the raw `Response` from `.asResponse()`/`.withResponse()`.
 * Instrumenting the body instead of the `Stream` covers all of them with one accumulator.
 *
 * Returns `false`, leaving the response untouched, for a body we can't wrap.
 *
 * @internal Exported for the diagnostics-channel integration.
 */
export function instrumentRawSseBody(response: { body?: unknown }, span: Span, recordOutputs: boolean): boolean {
  const body = response.body as ReadableStream<Uint8Array> | null | undefined;
  // An unsampled span is discarded by `endStreamSpan`, so decoding and parsing every frame for it buys
  // nothing — leave the body alone and let the caller's response stay exactly as the SDK built it.
  if (!body || typeof body.getReader !== 'function' || !span.isRecording()) {
    return false;
  }

  const state = createStreamingState();
  const decoder = new TextDecoder();
  let buffered = '';
  let settled = false;

  // Never lets an accumulation failure reach the caller: their stream matters more than our attributes.
  // Scoped to a single frame so one line we can't parse doesn't cost us its neighbours — `message_delta`
  // (token usage) and `message_stop` ride in the last chunk, where a bad frame would hurt most.
  const consumeFrame = (line: string): void => {
    // An SSE frame's `event:` line only repeats the `type` already carried by the JSON payload.
    if (!line.startsWith('data:')) {
      return;
    }
    try {
      processEvent(JSON.parse(line.slice(5)) as AnthropicAiStreamingEvent, state, recordOutputs, span);
    } catch {
      // A frame we can't parse is not worth breaking the caller's stream over.
    }
  };

  const consumeText = (text: string): void => {
    buffered += text;

    let newline = buffered.indexOf('\n');
    while (newline !== -1) {
      consumeFrame(buffered.slice(0, newline).trim());
      buffered = buffered.slice(newline + 1);
      newline = buffered.indexOf('\n');
    }
  };

  const consumeBytes = (chunk: Uint8Array): void => {
    try {
      consumeText(decoder.decode(chunk, { stream: true }));
    } catch {
      // As above: a chunk we can't decode is not worth breaking the caller's stream over.
    }
  };

  // No error status on a torn-down body, matching `instrumentAsyncIterableStream`: the SDK surfaces the
  // failure to the caller, and an `error` SSE frame already marks the span through `isErrorEvent`.
  const settle = (): void => {
    if (settled) {
      return;
    }
    settled = true;
    // A body that ends without a trailing newline leaves its last frame sitting in `buffered`.
    const trailing = buffered.trim();
    buffered = '';
    if (trailing) {
      consumeFrame(trailing);
    }
    endStreamSpan(span, state, recordOutputs);
  };

  // Resolved on every read rather than captured at wrap time: `clone()` tees the response's *internal*
  // body and swaps in one branch, which leaves the stream we were handed permanently locked.
  const readBody = findBoundGetter(response, 'body');
  const source = (): ReadableStream<Uint8Array> => (readBody?.() as ReadableStream<Uint8Array> | null) ?? body;

  // Acquired on the first read, never at wrap time: taking a reader disturbs the body, which would
  // make `response.text()`, `arrayBuffer()` and `clone()` throw on a response nobody has read yet.
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

  const underlyingSource = {
    async pull(controller: SseStreamController): Promise<void> {
      try {
        reader ??= source().getReader();
        const { done, value } = await reader.read();
        if (done) {
          settle();
          controller.close();
          return;
        }
        // Must precede the enqueue: a byte stream transfers the chunk's buffer, detaching it.
        consumeBytes(value);
        controller.enqueue(value);
      } catch (error) {
        settle();
        controller.error(error);
      }
    },
    async cancel(reason: unknown): Promise<void> {
      settle();
      await (reader ? reader.cancel(reason) : source().cancel(reason));
    },
  };

  // A high-water mark of 0 keeps the stream from pulling a chunk before anyone asks for one. The
  // default of 1 would read ahead the moment we wrap, disturbing a body the caller may never read.
  const strategy = { highWaterMark: 0 };
  let instrumented: ReadableStream<Uint8Array>;
  try {
    // `response.body` is a byte stream, so a plain one here would break `getReader({ mode: 'byob' })`
    // on a response that supported it before we touched it.
    instrumented = new ReadableStream<Uint8Array>(
      { ...underlyingSource, type: 'bytes' } as unknown as UnderlyingSource<Uint8Array>,
      strategy,
    );
  } catch {
    instrumented = new ReadableStream<Uint8Array>(underlyingSource as UnderlyingSource<Uint8Array>, strategy);
  }

  try {
    // `body` is a prototype getter, so an own data property shadows it for every later read.
    Object.defineProperty(response, 'body', { value: instrumented, configurable: true });
  } catch {
    return false;
  }

  // `text()`, `json()` and `arrayBuffer()` read the response's internal body and never touch the
  // property we just shadowed. Without wrapping them too, a caller draining the stream that way would
  // leave the span unended forever, since nothing else ends it once we take ownership.
  instrumentBodyConsumers(response, consumeText, settle);

  return true;
}

const BODY_CONSUMERS = ['text', 'json', 'arrayBuffer'] as const;

function instrumentBodyConsumers(
  response: Record<string, unknown>,
  consumeText: (text: string) => void,
  settle: () => void,
): void {
  for (const name of BODY_CONSUMERS) {
    const original = response[name];
    if (typeof original !== 'function') {
      continue;
    }

    const wrapped = function (this: unknown, ...args: unknown[]): Promise<unknown> {
      return Promise.resolve((original as (...a: unknown[]) => unknown).apply(this ?? response, args)).then(
        result => {
          // Whatever came back is the stream we would have accumulated off the body, so read the frames
          // out of it rather than settling for a span with request attributes only. `json()` returns
          // neither shape, since parsing an SSE body as JSON is a caller error to begin with.
          if (typeof result === 'string') {
            consumeText(result);
          } else if (result instanceof ArrayBuffer) {
            consumeText(new TextDecoder().decode(result));
          }
          settle();
          return result;
        },
        error => {
          settle();
          throw error;
        },
      );
    };

    try {
      Object.defineProperty(response, name, { value: wrapped, configurable: true, writable: true });
    } catch {
      // A consumer we can't wrap just means the span leans on the body wrapper to end.
    }
  }
}
