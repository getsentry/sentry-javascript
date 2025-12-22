import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../../utils/runner';

describe('OpenAI Tool Calls integration', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  const WEATHER_TOOL_DEFINITION = JSON.stringify([
    {
      type: 'function',
      function: {
        name: 'get_weather',
        description: 'Get the current weather in a given location',
        parameters: {
          type: 'object',
          properties: {
            latitude: { type: 'number', description: 'The latitude of the location' },
            longitude: { type: 'number', description: 'The longitude of the location' },
          },
          required: ['latitude', 'longitude'],
        },
      },
    },
  ]);

  const CHAT_TOOL_CALLS = JSON.stringify([
    {
      id: 'call_12345xyz',
      type: 'function',
      function: {
        name: 'get_weather',
        arguments: '{"latitude":48.8566,"longitude":2.3522}',
      },
    },
  ]);

  const CHAT_STREAM_TOOL_CALLS = JSON.stringify([
    {
      index: 0,
      id: 'call_12345xyz',
      type: 'function',
      function: {
        name: 'get_weather',
        arguments: '{"latitude":48.8566,"longitude":2.3522}',
      },
    },
  ]);

  const RESPONSES_TOOL_CALLS = JSON.stringify([
    {
      type: 'function_call',
      id: 'fc_12345xyz',
      call_id: 'call_12345xyz',
      name: 'get_weather',
      arguments: '{"latitude":48.8566,"longitude":2.3522}',
    },
  ]);

  const EXPECTED_TRANSACTION_DEFAULT_PII_FALSE = {
    transaction: 'main',
    spans: expect.arrayContaining([
      // First span - chat completion with tools (non-streaming)
      expect.objectContaining({
        data: {
          'gen_ai.operation.name': 'chat',
          'sentry.op': 'gen_ai.chat',
          'sentry.origin': 'auto.ai.openai',
          'gen_ai.system': 'openai',
          'gen_ai.request.model': 'gpt-4',
          'gen_ai.request.available_tools': WEATHER_TOOL_DEFINITION,
          'gen_ai.response.model': 'gpt-4',
          'gen_ai.response.id': 'chatcmpl-tools-123',
          'gen_ai.response.finish_reasons': '["tool_calls"]',
          'gen_ai.usage.input_tokens': 15,
          'gen_ai.usage.output_tokens': 25,
          'gen_ai.usage.total_tokens': 40,
          'openai.response.id': 'chatcmpl-tools-123',
          'openai.response.model': 'gpt-4',
          'openai.response.timestamp': '2023-03-01T06:31:40.000Z',
          'openai.usage.completion_tokens': 25,
          'openai.usage.prompt_tokens': 15,
        },
        description: 'chat gpt-4',
        op: 'gen_ai.chat',
        origin: 'auto.ai.openai',
        status: 'ok',
      }),
      // Second span - chat completion with tools and streaming
      expect.objectContaining({
        data: {
          'gen_ai.operation.name': 'chat',
          'sentry.op': 'gen_ai.chat',
          'sentry.origin': 'auto.ai.openai',
          'gen_ai.system': 'openai',
          'gen_ai.request.model': 'gpt-4',
          'gen_ai.request.stream': true,
          'gen_ai.request.available_tools': WEATHER_TOOL_DEFINITION,
          'gen_ai.response.model': 'gpt-4',
          'gen_ai.response.id': 'chatcmpl-stream-tools-123',
          'gen_ai.response.finish_reasons': '["tool_calls"]',
          'gen_ai.response.streaming': true,
          'gen_ai.usage.input_tokens': 15,
          'gen_ai.usage.output_tokens': 25,
          'gen_ai.usage.total_tokens': 40,
          'openai.response.id': 'chatcmpl-stream-tools-123',
          'openai.response.model': 'gpt-4',
          'openai.response.timestamp': '2023-03-01T06:31:45.000Z',
          'openai.usage.completion_tokens': 25,
          'openai.usage.prompt_tokens': 15,
        },
        description: 'chat gpt-4 stream-response',
        op: 'gen_ai.chat',
        origin: 'auto.ai.openai',
        status: 'ok',
      }),
      // Third span - responses API with tools (non-streaming)
      expect.objectContaining({
        data: {
          'gen_ai.operation.name': 'responses',
          'sentry.op': 'gen_ai.responses',
          'sentry.origin': 'auto.ai.openai',
          'gen_ai.system': 'openai',
          'gen_ai.request.model': 'gpt-4',
          'gen_ai.request.available_tools': WEATHER_TOOL_DEFINITION,
          'gen_ai.response.model': 'gpt-4',
          'gen_ai.response.id': 'resp_tools_789',
          'gen_ai.response.finish_reasons': '["completed"]',
          'gen_ai.usage.input_tokens': 8,
          'gen_ai.usage.output_tokens': 12,
          'gen_ai.usage.total_tokens': 20,
          'openai.response.id': 'resp_tools_789',
          'openai.response.model': 'gpt-4',
          'openai.response.timestamp': '2023-03-01T06:32:00.000Z',
          'openai.usage.completion_tokens': 12,
          'openai.usage.prompt_tokens': 8,
        },
        description: 'responses gpt-4',
        op: 'gen_ai.responses',
        origin: 'auto.ai.openai',
        status: 'ok',
      }),
      // Fourth span - responses API with tools and streaming
      expect.objectContaining({
        data: {
          'gen_ai.operation.name': 'responses',
          'sentry.op': 'gen_ai.responses',
          'sentry.origin': 'auto.ai.openai',
          'gen_ai.system': 'openai',
          'gen_ai.request.model': 'gpt-4',
          'gen_ai.request.stream': true,
          'gen_ai.request.available_tools': WEATHER_TOOL_DEFINITION,
          'gen_ai.response.model': 'gpt-4',
          'gen_ai.response.id': 'resp_stream_tools_789',
          'gen_ai.response.finish_reasons': '["in_progress","completed"]',
          'gen_ai.response.streaming': true,
          'gen_ai.usage.input_tokens': 8,
          'gen_ai.usage.output_tokens': 12,
          'gen_ai.usage.total_tokens': 20,
          'openai.response.id': 'resp_stream_tools_789',
          'openai.response.model': 'gpt-4',
          'openai.response.timestamp': '2023-03-01T06:31:50.000Z',
          'openai.usage.completion_tokens': 12,
          'openai.usage.prompt_tokens': 8,
        },
        description: 'responses gpt-4 stream-response',
        op: 'gen_ai.responses',
        origin: 'auto.ai.openai',
        status: 'ok',
      }),
    ]),
  };

  const EXPECTED_TRANSACTION_DEFAULT_PII_TRUE = {
    transaction: 'main',
    spans: expect.arrayContaining([
      // First span - chat completion with tools (non-streaming) with PII
      expect.objectContaining({
        data: {
          'gen_ai.operation.name': 'chat',
          'sentry.op': 'gen_ai.chat',
          'sentry.origin': 'auto.ai.openai',
          'gen_ai.system': 'openai',
          'gen_ai.request.model': 'gpt-4',
          'gen_ai.request.messages.original_length': 1,
          'gen_ai.request.messages': '[{"role":"user","content":"What is the weather like in Paris today?"}]',
          'gen_ai.request.available_tools': WEATHER_TOOL_DEFINITION,
          'gen_ai.response.model': 'gpt-4',
          'gen_ai.response.id': 'chatcmpl-tools-123',
          'gen_ai.response.finish_reasons': '["tool_calls"]',
          'gen_ai.response.text': '[""]',
          'gen_ai.response.tool_calls': CHAT_TOOL_CALLS,
          'gen_ai.usage.input_tokens': 15,
          'gen_ai.usage.output_tokens': 25,
          'gen_ai.usage.total_tokens': 40,
          'openai.response.id': 'chatcmpl-tools-123',
          'openai.response.model': 'gpt-4',
          'openai.response.timestamp': '2023-03-01T06:31:40.000Z',
          'openai.usage.completion_tokens': 25,
          'openai.usage.prompt_tokens': 15,
        },
        description: 'chat gpt-4',
        op: 'gen_ai.chat',
        origin: 'auto.ai.openai',
        status: 'ok',
      }),
      // Second span - chat completion with tools and streaming with PII
      expect.objectContaining({
        data: {
          'gen_ai.operation.name': 'chat',
          'sentry.op': 'gen_ai.chat',
          'sentry.origin': 'auto.ai.openai',
          'gen_ai.system': 'openai',
          'gen_ai.request.model': 'gpt-4',
          'gen_ai.request.stream': true,
          'gen_ai.request.messages.original_length': 1,
          'gen_ai.request.messages': '[{"role":"user","content":"What is the weather like in Paris today?"}]',
          'gen_ai.request.available_tools': WEATHER_TOOL_DEFINITION,
          'gen_ai.response.model': 'gpt-4',
          'gen_ai.response.id': 'chatcmpl-stream-tools-123',
          'gen_ai.response.finish_reasons': '["tool_calls"]',
          'gen_ai.response.streaming': true,
          'gen_ai.response.tool_calls': CHAT_STREAM_TOOL_CALLS,
          'gen_ai.usage.input_tokens': 15,
          'gen_ai.usage.output_tokens': 25,
          'gen_ai.usage.total_tokens': 40,
          'openai.response.id': 'chatcmpl-stream-tools-123',
          'openai.response.model': 'gpt-4',
          'openai.response.timestamp': '2023-03-01T06:31:45.000Z',
          'openai.usage.completion_tokens': 25,
          'openai.usage.prompt_tokens': 15,
        },
        description: 'chat gpt-4 stream-response',
        op: 'gen_ai.chat',
        origin: 'auto.ai.openai',
        status: 'ok',
      }),
      // Third span - responses API with tools (non-streaming) with PII
      expect.objectContaining({
        data: {
          'gen_ai.operation.name': 'responses',
          'sentry.op': 'gen_ai.responses',
          'sentry.origin': 'auto.ai.openai',
          'gen_ai.system': 'openai',
          'gen_ai.request.model': 'gpt-4',
          'gen_ai.request.messages.original_length': 1,
          'gen_ai.request.messages': '[{"role":"user","content":"What is the weather like in Paris today?"}]',
          'gen_ai.request.available_tools': WEATHER_TOOL_DEFINITION,
          'gen_ai.response.model': 'gpt-4',
          'gen_ai.response.id': 'resp_tools_789',
          'gen_ai.response.finish_reasons': '["completed"]',
          'gen_ai.response.tool_calls': RESPONSES_TOOL_CALLS,
          'gen_ai.usage.input_tokens': 8,
          'gen_ai.usage.output_tokens': 12,
          'gen_ai.usage.total_tokens': 20,
          'openai.response.id': 'resp_tools_789',
          'openai.response.model': 'gpt-4',
          'openai.response.timestamp': '2023-03-01T06:32:00.000Z',
          'openai.usage.completion_tokens': 12,
          'openai.usage.prompt_tokens': 8,
        },
        description: 'responses gpt-4',
        op: 'gen_ai.responses',
        origin: 'auto.ai.openai',
        status: 'ok',
      }),
      // Fourth span - responses API with tools and streaming with PII
      expect.objectContaining({
        data: {
          'gen_ai.operation.name': 'responses',
          'sentry.op': 'gen_ai.responses',
          'sentry.origin': 'auto.ai.openai',
          'gen_ai.system': 'openai',
          'gen_ai.request.model': 'gpt-4',
          'gen_ai.request.stream': true,
          'gen_ai.request.messages.original_length': 1,
          'gen_ai.request.messages': '[{"role":"user","content":"What is the weather like in Paris today?"}]',
          'gen_ai.request.available_tools': WEATHER_TOOL_DEFINITION,
          'gen_ai.response.model': 'gpt-4',
          'gen_ai.response.id': 'resp_stream_tools_789',
          'gen_ai.response.finish_reasons': '["in_progress","completed"]',
          'gen_ai.response.streaming': true,
          'gen_ai.response.tool_calls': RESPONSES_TOOL_CALLS,
          'gen_ai.usage.input_tokens': 8,
          'gen_ai.usage.output_tokens': 12,
          'gen_ai.usage.total_tokens': 20,
          'openai.response.id': 'resp_stream_tools_789',
          'openai.response.model': 'gpt-4',
          'openai.response.timestamp': '2023-03-01T06:31:50.000Z',
          'openai.usage.completion_tokens': 12,
          'openai.usage.prompt_tokens': 8,
        },
        description: 'responses gpt-4 stream-response',
        op: 'gen_ai.responses',
        origin: 'auto.ai.openai',
        status: 'ok',
      }),
    ]),
  };

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    test('creates openai tool calls related spans with sendDefaultPii: false', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: EXPECTED_TRANSACTION_DEFAULT_PII_FALSE })
        .start()
        .completed();
    });
  });

  createEsmAndCjsTests(__dirname, 'scenario.mjs', 'instrument-with-pii.mjs', (createRunner, test) => {
    test('creates openai tool calls related spans with sendDefaultPii: true', async () => {
      await createRunner()
        .ignore('event')
        .expect({ transaction: EXPECTED_TRANSACTION_DEFAULT_PII_TRUE })
        .start()
        .completed();
    });
  });
});
