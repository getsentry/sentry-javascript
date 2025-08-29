import { instrumentAnthropicAiClient } from '@sentry/core';
import * as Sentry from '@sentry/node';

function createMockStreamEvents(model = 'claude-3-haiku-20240307') {
  async function* generator() {
    // Provide message metadata early so the span can capture id/model/usage input tokens
    yield {
      type: 'content_block_start',
      message: {
        id: 'msg_stream_1',
        type: 'message',
        role: 'assistant',
        model,
        content: [],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: {
          input_tokens: 10,
        },
      },
    };

    // Streamed text chunks
    yield { type: 'content_block_delta', delta: { text: 'Hello ' } };
    yield { type: 'content_block_delta', delta: { text: 'from ' } };
    yield { type: 'content_block_delta', delta: { text: 'stream!' } };

    // Final usage totals for output tokens
    yield { type: 'message_delta', usage: { output_tokens: 15 } };
  }

  return generator();
}

class MockAnthropic {
  constructor(config) {
    this.apiKey = config.apiKey;

    this.messages = {
      create: this._messagesCreate.bind(this),
      stream: this._messagesStream.bind(this),
    };
  }

  async _messagesCreate(params) {
    await new Promise(resolve => setTimeout(resolve, 5));
    if (params?.stream === true) {
      return createMockStreamEvents(params.model);
    }
    // Fallback non-streaming behavior (not used in this scenario)
    return {
      id: 'msg_mock123',
      type: 'message',
      model: params.model,
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: 'Hello from Anthropic mock!',
        },
      ],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: {
        input_tokens: 10,
        output_tokens: 15,
      },
    };
  }

  async _messagesStream(params) {
    await new Promise(resolve => setTimeout(resolve, 5));
    return createMockStreamEvents(params?.model);
  }
}

async function run() {
  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const mockClient = new MockAnthropic({ apiKey: 'mock-api-key' });
    const client = instrumentAnthropicAiClient(mockClient);

    // 1) Streaming via stream: true param on messages.create
    const stream1 = await client.messages.create({
      model: 'claude-3-haiku-20240307',
      messages: [{ role: 'user', content: 'Stream this please' }],
      stream: true,
    });
    for await (const _ of stream1) {
      void _;
    }

    // 2) Streaming via messages.stream API
    const stream2 = await client.messages.stream({
      model: 'claude-3-haiku-20240307',
      messages: [{ role: 'user', content: 'Stream this too' }],
    });
    for await (const _ of stream2) {
      void _;
    }
  });
}

run();


