import { instrumentAnthropicAiClient } from '@sentry/core';
import * as Sentry from '@sentry/node';

// Generator for default fallback
function createMockDefaultFallbackStream() {
  async function* generator() {
    yield {
      type: 'content_block_start',
      index: 0,
    };
    yield {
      type: 'content_block_delta',
      index: 0,
      delta: { text: 'This stream will work fine.' },
    };
    yield {
      type: 'content_block_stop',
      index: 0,
    };
  }
  return generator();
}

// Generator that errors midway through streaming
function createMockMidwayErrorStream() {
  async function* generator() {
    // First yield some initial data to start the stream
    yield {
      type: 'content_block_start',
      message: {
        id: 'msg_error_stream_1',
        type: 'message',
        role: 'assistant',
        model: 'claude-3-haiku-20240307',
        content: [],
        usage: { input_tokens: 5 },
      },
    };

    // Yield one chunk of content
    yield { type: 'content_block_delta', delta: { text: 'This stream will ' } };

    // Then throw an error
    await new Promise(resolve => setTimeout(resolve, 5));
    throw new Error('Stream interrupted');
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

  // client.messages.create with stream: true
  async _messagesCreate(params) {
    await new Promise(resolve => setTimeout(resolve, 5));

    // Error on initialization for 'error-stream-init' model
    if (params.model === 'error-stream-init') {
      if (params?.stream === true) {
        throw new Error('Failed to initialize stream');
      }
    }

    // Error midway for 'error-stream-midway' model
    if (params.model === 'error-stream-midway') {
      if (params?.stream === true) {
        return createMockMidwayErrorStream();
      }
    }

    // Default fallback
    return {
      id: 'msg_mock123',
      type: 'message',
      model: params.model,
      role: 'assistant',
      content: [{ type: 'text', text: 'Non-stream response' }],
      usage: { input_tokens: 5, output_tokens: 7 },
    };
  }

  // client.messages.stream
  async _messagesStream(params) {
    await new Promise(resolve => setTimeout(resolve, 5));

    // Error on initialization for 'error-stream-init' model
    if (params.model === 'error-stream-init') {
      throw new Error('Failed to initialize stream');
    }

    // Error midway for 'error-stream-midway' model
    if (params.model === 'error-stream-midway') {
      return createMockMidwayErrorStream();
    }

    // Default fallback
    return createMockDefaultFallbackStream();
  }
}

async function run() {
  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const mockClient = new MockAnthropic({ apiKey: 'mock-api-key' });
    const client = instrumentAnthropicAiClient(mockClient);

    // 1) Error on stream initialization with messages.create
    try {
      await client.messages.create({
        model: 'error-stream-init',
        messages: [{ role: 'user', content: 'This will fail immediately' }],
        stream: true,
      });
    } catch {
      // Error expected
    }

    // 2) Error on stream initialization with messages.stream
    try {
      await client.messages.stream({
        model: 'error-stream-init',
        messages: [{ role: 'user', content: 'This will also fail immediately' }],
      });
    } catch {
      // Error expected
    }

    // 3) Error midway through streaming with messages.create
    try {
      const stream = await client.messages.create({
        model: 'error-stream-midway',
        messages: [{ role: 'user', content: 'This will fail midway' }],
        stream: true,
      });

      for await (const _ of stream) {
        void _;
      }
    } catch {
      // Error expected
    }

    // 4) Error midway through streaming with messages.stream
    try {
      const stream = await client.messages.stream({
        model: 'error-stream-midway',
        messages: [{ role: 'user', content: 'This will also fail midway' }],
      });

      for await (const _ of stream) {
        void _;
      }
    } catch {
      // Error expected
    }
  });
}

run();
