import { captureException, SPAN_STATUS_ERROR } from '@sentry/core';
import type { Span } from '@sentry/core';
import { endStreamSpan } from '../core/utils';
import type { AnthropicAiStreamingEvent } from './types';
import { mapAnthropicErrorToStatusMessage } from './utils';

/**
 * State object used to accumulate information from a stream of Anthropic AI events.
 */
interface StreamingState {
  /** Collected response text fragments (for output recording). */
  responseTexts: string[];
  /** Reasons for finishing the response, as reported by the API. */
  finishReasons: string[];
  /** The response ID. */
  responseId: string;
  /** The model name. */
  responseModel: string;
  /** Number of prompt/input tokens used. */
  promptTokens: number | undefined;
  /** Number of completion/output tokens used. */
  completionTokens: number | undefined;
  /** Number of cache creation input tokens used. */
  cacheCreationInputTokens: number | undefined;
  /** Number of cache read input tokens used. */
  cacheReadInputTokens: number | undefined;
  /** Accumulated tool calls (finalized) */
  toolCalls: Array<Record<string, unknown>>;
  /** In-progress tool call blocks keyed by index */
  activeToolBlocks: Record<
    number,
    {
      id?: string;
      name?: string;
      inputJsonParts: string[];
    }
  >;
}

function createStreamingState(): StreamingState {
  return {
    responseTexts: [],
    finishReasons: [],
    responseId: '',
    responseModel: '',
    promptTokens: undefined,
    completionTokens: undefined,
    cacheCreationInputTokens: undefined,
    cacheReadInputTokens: undefined,
    toolCalls: [],
    activeToolBlocks: {},
  };
}

/**
 * Checks if an event is an error event
 * @param event - The event to process
 * @param state - The state of the streaming process
 * @param recordOutputs - Whether to record outputs
 * @param span - The span to update
 * @returns Whether an error occurred
 */

function isErrorEvent(event: AnthropicAiStreamingEvent, span: Span): boolean {
  if ('type' in event && typeof event.type === 'string') {
    if (event.type === 'error') {
      // The SDK surfaces this error to the caller (the async iterator rejects / their `error`
      // listener fires), so we only mark the span failed and do not record it.
      span.setStatus({ code: SPAN_STATUS_ERROR, message: mapAnthropicErrorToStatusMessage(event.error?.type) });
      return true;
    }
  }
  return false;
}

/**
 * Processes the message metadata of an event
 * @param event - The event to process
 * @param state - The state of the streaming process
 */

function handleMessageMetadata(event: AnthropicAiStreamingEvent, state: StreamingState): void {
  // Cumulative token counts and the final stop reason both arrive on the message_delta event.
  // @see https://docs.anthropic.com/en/docs/build-with-claude/streaming#event-types
  if (event.type === 'message_delta') {
    if (event.usage && typeof event.usage.output_tokens === 'number') {
      state.completionTokens = event.usage.output_tokens;
    }
    if (event.delta?.stop_reason) {
      state.finishReasons.push(event.delta.stop_reason);
    }
  }

  if (event.message) {
    const message = event.message;

    if (message.id) state.responseId = message.id;
    if (message.model) state.responseModel = message.model;

    if (message.usage) {
      if (typeof message.usage.input_tokens === 'number') state.promptTokens = message.usage.input_tokens;
      if (typeof message.usage.cache_creation_input_tokens === 'number')
        state.cacheCreationInputTokens = message.usage.cache_creation_input_tokens;
      if (typeof message.usage.cache_read_input_tokens === 'number')
        state.cacheReadInputTokens = message.usage.cache_read_input_tokens;
    }
  }
}

/**
 * Handle start of a content block (e.g., tool_use)
 */
function handleContentBlockStart(event: AnthropicAiStreamingEvent, state: StreamingState): void {
  if (event.type !== 'content_block_start' || typeof event.index !== 'number' || !event.content_block) return;
  if (event.content_block.type === 'tool_use' || event.content_block.type === 'server_tool_use') {
    state.activeToolBlocks[event.index] = {
      id: event.content_block.id,
      name: event.content_block.name,
      inputJsonParts: [],
    };
  }
}

/**
 * Handle deltas of a content block, including input_json_delta for tool_use
 */
function handleContentBlockDelta(
  event: AnthropicAiStreamingEvent,
  state: StreamingState,
  recordOutputs: boolean,
): void {
  if (event.type !== 'content_block_delta' || !event.delta) return;

  // Accumulate tool_use input JSON deltas only when we have an index and an active tool block
  if (
    typeof event.index === 'number' &&
    'partial_json' in event.delta &&
    typeof event.delta.partial_json === 'string'
  ) {
    const active = state.activeToolBlocks[event.index];
    if (active) {
      active.inputJsonParts.push(event.delta.partial_json);
    }
  }

  // Accumulate streamed response text regardless of index
  if (recordOutputs && typeof event.delta.text === 'string') {
    state.responseTexts.push(event.delta.text);
  }
}

/**
 * Handle stop of a content block; finalize tool_use entries
 */
function handleContentBlockStop(event: AnthropicAiStreamingEvent, state: StreamingState): void {
  if (event.type !== 'content_block_stop' || typeof event.index !== 'number') return;

  const active = state.activeToolBlocks[event.index];
  if (!active) return;

  const raw = active.inputJsonParts.join('');
  let parsedInput: unknown;

  try {
    parsedInput = raw ? JSON.parse(raw) : {};
  } catch {
    parsedInput = { __unparsed: raw };
  }

  state.toolCalls.push({
    type: 'tool_use',
    id: active.id,
    name: active.name,
    input: parsedInput,
  });

  // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
  delete state.activeToolBlocks[event.index];
}

/**
 * Processes an event
 * @param event - The event to process
 * @param state - The state of the streaming process
 * @param recordOutputs - Whether to record outputs
 * @param span - The span to update
 */
function processEvent(
  event: AnthropicAiStreamingEvent,
  state: StreamingState,
  recordOutputs: boolean,
  span: Span,
): void {
  if (!(event && typeof event === 'object')) {
    return;
  }

  const isError = isErrorEvent(event, span);
  if (isError) return;

  handleMessageMetadata(event, state);

  // Tool call events are sent via 3 separate events:
  // - content_block_start (start of the tool call)
  // - content_block_delta (delta aka input of the tool call)
  // - content_block_stop (end of the tool call)
  // We need to handle them all to capture the full tool call.
  handleContentBlockStart(event, state);
  handleContentBlockDelta(event, state, recordOutputs);
  handleContentBlockStop(event, state);
}

/**
 * Instruments an async iterable stream of Anthropic events, updates the span with
 * streaming attributes and (optionally) the aggregated output text, and yields
 * each event from the input stream unchanged.
 */
export async function* instrumentAsyncIterableStream(
  stream: AsyncIterable<AnthropicAiStreamingEvent>,
  span: Span,
  recordOutputs: boolean,
): AsyncGenerator<AnthropicAiStreamingEvent, void, unknown> {
  const state = createStreamingState();

  try {
    for await (const event of stream) {
      processEvent(event, state, recordOutputs, span);
      yield event;
    }
  } finally {
    endStreamSpan(span, state, recordOutputs);
  }
}

/**
 * Instruments a MessageStream by registering event handlers and preserving the original stream API.
 */
export function instrumentMessageStream<R extends { on: (...args: unknown[]) => void }>(
  stream: R,
  span: Span,
  recordOutputs: boolean,
): R {
  const state = createStreamingState();

  stream.on('streamEvent', (event: unknown) => {
    processEvent(event as AnthropicAiStreamingEvent, state, recordOutputs, span);
  });

  // The event fired when a message is done being streamed by the API. Corresponds to the message_stop SSE event.
  // @see https://github.com/anthropics/anthropic-sdk-typescript/blob/d3be31f5a4e6ebb4c0a2f65dbb8f381ae73a9166/helpers.md?plain=1#L42-L44
  stream.on('message', () => {
    endStreamSpan(span, state, recordOutputs);
  });

  stream.on('error', (error: unknown) => {
    // Attaching this listener stops the stream error from being raised as an unhandled rejection, so
    // we capture it here to avoid swallowing it (e.g. for callers that don't await/iterate the stream).
    captureException(error, {
      mechanism: {
        handled: false,
        type: 'auto.ai.anthropic.stream_error',
      },
    });

    if (span.isRecording()) {
      span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
      span.end();
    }
  });

  return stream;
}

/** Handle returned by {@link instrumentRawSseBody} for the `Stream`-iterator path to claim the span. */
export interface RawSseBodyHandle {
  /** Called when the SDK `Stream`'s async iterator takes over, so the body wrapper stays a pass-through. */
  claim: () => void;
}

/**
 * Replace `response.body` with a pass-through that accumulates the SSE frames flowing through it and
 * ends `span` when the body is exhausted, cancelled or errors.
 *
 * Every way of draining an Anthropic stream bottoms out in `response.body`: the SDK `Stream`'s async
 * iterator, `tee()`, and a caller reading `.asResponse()`/`.withResponse()`'s raw `Response`. Only the
 * first of those is visible to {@link instrumentAsyncIterableStream}, so without this the other two end
 * no span at all. When the iterator path does run it claims the span and this wrapper goes quiet, so a
 * chunk is never accounted for twice.
 *
 * Returns `undefined` — leaving the response untouched — for a body we can't wrap.
 */
export function instrumentRawSseBody(
  response: { body?: unknown },
  span: Span,
  recordOutputs: boolean,
): RawSseBodyHandle | undefined {
  const body = response.body as ReadableStream<Uint8Array> | null | undefined;
  if (!body || typeof body.getReader !== 'function') {
    return undefined;
  }

  const state = createStreamingState();
  const decoder = new TextDecoder();
  let buffered = '';
  let claimed = false;
  let settled = false;

  // Never lets an accumulation failure reach the caller: their stream matters more than our attributes.
  const consume = (chunk: Uint8Array): void => {
    try {
      buffered += decoder.decode(chunk, { stream: true });

      let newline = buffered.indexOf('\n');
      while (newline !== -1) {
        const line = buffered.slice(0, newline).trim();
        buffered = buffered.slice(newline + 1);
        // An SSE frame's `event:` line only repeats the `type` already carried by the JSON payload.
        if (line.startsWith('data:')) {
          processEvent(JSON.parse(line.slice(5)) as AnthropicAiStreamingEvent, state, recordOutputs, span);
        }
        newline = buffered.indexOf('\n');
      }
    } catch {
      // A frame we can't decode or parse is not worth breaking the caller's stream over.
    }
  };

  const settle = (error?: unknown): void => {
    if (settled || claimed) {
      return;
    }
    settled = true;
    if (error !== undefined) {
      span.setStatus({ code: SPAN_STATUS_ERROR, message: 'internal_error' });
    }
    endStreamSpan(span, state, recordOutputs);
  };

  // Acquired on the first read, never at wrap time: taking a reader disturbs the body, which would
  // make `response.text()`, `arrayBuffer()` and `clone()` throw on a response nobody has read yet.
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

  const instrumented = new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        try {
          reader ??= body.getReader();
          const { done, value } = await reader.read();
          if (done) {
            settle();
            controller.close();
            return;
          }
          if (!claimed) {
            consume(value);
          }
          controller.enqueue(value);
        } catch (error) {
          settle(error);
          controller.error(error);
        }
      },
      async cancel(reason) {
        settle();
        await (reader ? reader.cancel(reason) : body.cancel(reason));
      },
    },
    // A high-water mark of 0 keeps the stream from pulling a chunk before anyone asks for one. The
    // default of 1 would read ahead the moment we wrap, disturbing a body the caller may never read.
    { highWaterMark: 0 },
  );

  try {
    // `body` is a prototype getter, so an own data property shadows it for every later read.
    Object.defineProperty(response, 'body', { value: instrumented, configurable: true });
  } catch {
    return undefined;
  }

  return {
    claim: () => {
      claimed = true;
    },
  };
}
