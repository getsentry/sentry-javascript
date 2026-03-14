import { describe, expect, it, vi } from 'vitest';
import { instrumentStream } from '../../../src/tracing/openai/streaming';
import type { ChatCompletionChunk, ResponseStreamingEvent } from '../../../src/tracing/openai/types';

async function collectStream<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const events: T[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}

describe('openai-streaming', () => {
  it('should backfill the request model and span name for streamed Responses API events', async () => {
    async function* createStream(): AsyncGenerator<ResponseStreamingEvent> {
      yield {
        type: 'response.completed',
        response: {
          object: 'response',
          id: 'resp_123',
          model: 'gpt-4.1-mini',
          created_at: 1704067200,
          status: 'completed',
        },
      } as ResponseStreamingEvent;
    }

    const span = {
      setAttributes: vi.fn(),
      setStatus: vi.fn(),
      updateName: vi.fn(),
      end: vi.fn(),
    };

    const events = await collectStream(
      instrumentStream(createStream(), span as unknown as Parameters<typeof instrumentStream>[1], false),
    );

    expect(events).toHaveLength(1);
    expect(span.setAttributes).toHaveBeenCalledWith({
      'gen_ai.request.model': 'gpt-4.1-mini',
    });
    expect(span.updateName).toHaveBeenCalledWith('chat gpt-4.1-mini');
    expect(span.end).toHaveBeenCalled();
  });

  it('should not backfill the request model or rename the span for chat completion streams', async () => {
    async function* createStream(): AsyncGenerator<ChatCompletionChunk> {
      yield {
        object: 'chat.completion.chunk',
        id: 'chatcmpl_123',
        created: 1704067200,
        model: 'gpt-4o-2024-08-06',
        choices: [],
      } as ChatCompletionChunk;
    }

    const span = {
      setAttributes: vi.fn(),
      setStatus: vi.fn(),
      updateName: vi.fn(),
      end: vi.fn(),
    };

    const events = await collectStream(
      instrumentStream(createStream(), span as unknown as Parameters<typeof instrumentStream>[1], false),
    );

    expect(events).toHaveLength(1);
    expect(span.setAttributes).not.toHaveBeenCalledWith({
      'gen_ai.request.model': 'gpt-4o-2024-08-06',
    });
    expect(span.updateName).not.toHaveBeenCalledWith('chat gpt-4o-2024-08-06');
    expect(span.end).toHaveBeenCalled();
  });
});
