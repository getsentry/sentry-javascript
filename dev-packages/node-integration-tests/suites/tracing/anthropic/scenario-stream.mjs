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

// Mimics Anthropic SDK's MessageStream class
class MockMessageStream {
  constructor(model) {
    this._model = model;
    this._eventHandlers = {};
  }

  on(event, handler) {
    if (!this._eventHandlers[event]) {
      this._eventHandlers[event] = [];
    }
    this._eventHandlers[event].push(handler);

    // Start processing events asynchronously (don't await)
    if (event === 'streamEvent' && !this._processing) {
      this._processing = true;
      this._processEvents();
    }

    return this;
  }

  async _processEvents() {
    try {
      const generator = createMockStreamEvents(this._model);
      for await (const event of generator) {
        if (this._eventHandlers['streamEvent']) {
          for (const handler of this._eventHandlers['streamEvent']) {
            handler(event);
          }
        }
      }

      // Emit 'message' event when done
      if (this._eventHandlers['message']) {
        for (const handler of this._eventHandlers['message']) {
          handler();
        }
      }
    } catch (error) {
      if (this._eventHandlers['error']) {
        for (const handler of this._eventHandlers['error']) {
          handler(error);
        }
      }
    }
  }

  async *[Symbol.asyncIterator]() {
    const generator = createMockStreamEvents(this._model);
    for await (const event of generator) {
      yield event;
    }
  }
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

  // This should return synchronously (like the real Anthropic SDK)
  _messagesStream(params) {
    return new MockMessageStream(params?.model);
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
    const stream2 = client.messages.stream({
      model: 'claude-3-haiku-20240307',
      messages: [{ role: 'user', content: 'Stream this too' }],
    });
    for await (const _ of stream2) {
      void _;
    }

    // 3) Streaming via messages.stream API with redundant stream: true param
    const stream3 = client.messages.stream({
      model: 'claude-3-haiku-20240307',
      messages: [{ role: 'user', content: 'Stream with param' }],
      stream: true, // This param is redundant but should not break synchronous behavior
    });
    // Verify it has .on() method immediately (not a Promise)
    if (typeof stream3.on !== 'function') {
      throw new Error('BUG: messages.stream() with stream: true did not return MessageStream synchronously!');
    }
    for await (const _ of stream3) {
      void _;
    }
  });
}

run();
