import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  GEN_AI_RESPONSE_FINISH_REASONS,
  GEN_AI_RESPONSE_TEXT,
  GEN_AI_USAGE_OUTPUT_TOKENS,
} from '@sentry/conventions/attributes';
import { getMainCarrier, setCurrentClient, spanToStaticSpanJSON, startInactiveSpan } from '@sentry/core';
import type { Span } from '@sentry/core';
import { instrumentRawSseBody } from '../../../../src/ai/anthropic-ai/sse-body';
import { getDefaultTestClientOptions, TestClient } from '../../../mocks/client';

const FRAMES = {
  start: { type: 'message_start', message: { id: 'msg_1', model: 'claude-3-haiku-20240307', usage: {} } },
  blockStart: { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
  delta: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hi' } },
  blockStop: { type: 'content_block_stop', index: 0 },
  messageDelta: { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 7 } },
  stop: { type: 'message_stop' },
};

function sse(frame: unknown): string {
  return `event: x\ndata: ${JSON.stringify(frame)}\n\n`;
}

/** Mirrors the shape the wrapper relies on: `body` as a prototype getter over a byte stream. */
class FakeResponse {
  private _stream: ReadableStream<Uint8Array>;

  public constructor(chunks: string[]) {
    const encoder = new TextEncoder();
    const queue = [...chunks];
    this._stream = new ReadableStream({
      type: 'bytes',
      pull(controller) {
        const next = queue.shift();
        if (next === undefined) {
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode(next));
      },
    });
  }

  public get body(): ReadableStream<Uint8Array> {
    return this._stream;
  }

  public async text(): Promise<string> {
    const decoder = new TextDecoder();
    const reader = this._stream.getReader();
    let out = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        return out;
      }
      out += decoder.decode(value, { stream: true });
    }
  }
}

async function drain(stream: ReadableStream<Uint8Array>): Promise<void> {
  const reader = stream.getReader();
  for (;;) {
    const { done } = await reader.read();
    if (done) {
      return;
    }
  }
}

describe('instrumentRawSseBody', () => {
  function setupClient(tracesSampleRate = 1): Span[] {
    const client = new TestClient(
      getDefaultTestClientOptions({
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
        tracesSampleRate,
      }),
    );
    setCurrentClient(client);
    client.init();

    const endedSpans: Span[] = [];
    client.on('spanEnd', span => endedSpans.push(span));
    return endedSpans;
  }

  beforeEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
  });

  afterEach(() => {
    getMainCarrier().__SENTRY__ = undefined;
  });

  it('keeps the frames that follow one it cannot parse', async () => {
    setupClient();
    const span = startInactiveSpan({ name: 'chat' });
    // The unparsable frame shares a chunk with the two that carry usage and the finish reason.
    const response = new FakeResponse([
      sse(FRAMES.start) + sse(FRAMES.blockStart) + sse(FRAMES.delta) + sse(FRAMES.blockStop),
      `event: x\ndata: {not json\n\n${sse(FRAMES.messageDelta)}${sse(FRAMES.stop)}`,
    ]);

    expect(instrumentRawSseBody(response, span, true)).toBe(true);
    await drain(response.body);

    const data = spanToStaticSpanJSON(span).data;
    expect(data[GEN_AI_USAGE_OUTPUT_TOKENS]).toBe(7);
    expect(data[GEN_AI_RESPONSE_FINISH_REASONS]).toBe('["end_turn"]');
    expect(data[GEN_AI_RESPONSE_TEXT]).toBe('Hi');
  });

  it('records the final frame of a body that ends without a trailing newline', async () => {
    setupClient();
    const span = startInactiveSpan({ name: 'chat' });
    const response = new FakeResponse([
      sse(FRAMES.start) + sse(FRAMES.blockStart) + sse(FRAMES.delta) + sse(FRAMES.blockStop),
      `data: ${JSON.stringify(FRAMES.messageDelta)}`,
    ]);

    expect(instrumentRawSseBody(response, span, true)).toBe(true);
    await drain(response.body);

    expect(spanToStaticSpanJSON(span).data[GEN_AI_USAGE_OUTPUT_TOKENS]).toBe(7);
  });

  it('ends the span when the body is drained through text()', async () => {
    const endedSpans = setupClient();
    const span = startInactiveSpan({ name: 'chat' });
    const response = new FakeResponse([sse(FRAMES.start), sse(FRAMES.messageDelta), sse(FRAMES.stop)]);

    expect(instrumentRawSseBody(response, span, true)).toBe(true);
    await response.text();

    expect(endedSpans).toHaveLength(1);
    expect(spanToStaticSpanJSON(endedSpans[0]!).data[GEN_AI_USAGE_OUTPUT_TOKENS]).toBe(7);
  });

  it('leaves the response untouched for an unsampled span', () => {
    setupClient(0);
    const span = startInactiveSpan({ name: 'chat' });
    const response = new FakeResponse([sse(FRAMES.stop)]);
    const body = response.body;

    expect(instrumentRawSseBody(response, span, true)).toBe(false);
    expect(response.body).toBe(body);
  });

  it('leaves a response whose body is not a web stream untouched', () => {
    setupClient();
    const span = startInactiveSpan({ name: 'chat' });
    const response = { body: { [Symbol.asyncIterator]: () => ({}) } };

    expect(instrumentRawSseBody(response, span, true)).toBe(false);
  });
});
