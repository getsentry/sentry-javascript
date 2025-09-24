import { instrumentAnthropicAiClient } from '@sentry/core';
import * as Sentry from '@sentry/node';

function createMockStreamEvents(model = 'claude-3-haiku-20240307') {
  async function* generator() {
    // initial message metadata with id/model and input tokens
    yield {
      type: 'content_block_start',
      message: {
        id: 'msg_stream_tool_1',
        type: 'message',
        role: 'assistant',
        model,
        content: [],
        stop_reason: 'end_turn',
        usage: { input_tokens: 11 },
      },
    };

    // streamed text
    yield { type: 'content_block_delta', delta: { text: 'Starting tool...' } };

    // tool_use streamed via partial json
    yield {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'tool_use', id: 'tool_weather_2', name: 'weather' },
    };
    yield { type: 'content_block_delta', index: 0, delta: { partial_json: '{"city":' } };
    yield { type: 'content_block_delta', index: 0, delta: { partial_json: '"Paris"}' } };
    yield { type: 'content_block_stop', index: 0 };

    // more text
    yield { type: 'content_block_delta', delta: { text: 'Done.' } };

    // final usage
    yield { type: 'message_delta', usage: { output_tokens: 9 } };
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
    if (params?.stream) {
      return createMockStreamEvents(params.model);
    }
    return {
      id: 'msg_mock_no_stream',
      type: 'message',
      model: params.model,
      role: 'assistant',
      content: [{ type: 'text', text: 'No stream' }],
      usage: { input_tokens: 2, output_tokens: 3 },
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

    // stream via create(stream:true)
    const stream1 = await client.messages.create({
      model: 'claude-3-haiku-20240307',
      messages: [{ role: 'user', content: 'Need the weather' }],
      tools: [
        {
          name: 'weather',
          description: 'Get weather',
          input_schema: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
        },
      ],
      stream: true,
    });
    for await (const _ of stream1) {
      void _;
    }

    // stream via messages.stream
    const stream2 = await client.messages.stream({
      model: 'claude-3-haiku-20240307',
      messages: [{ role: 'user', content: 'Need the weather' }],
      tools: [
        {
          name: 'weather',
          description: 'Get weather',
          input_schema: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
        },
      ],
    });
    for await (const _ of stream2) {
      void _;
    }
  });
}

run();
