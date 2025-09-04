import { instrumentOpenAiClient } from '@sentry/core';
import * as Sentry from '@sentry/node';

class MockOpenAIToolCalls {
  constructor(config) {
    this.apiKey = config.apiKey;

    this.chat = {
      completions: {
        create: async params => {
          // Simulate processing time
          await new Promise(resolve => setTimeout(resolve, 10));

          // If stream is requested, return an async generator
          if (params.stream) {
            return this._createChatCompletionToolCallsStream(params);
          }

          // Non-streaming tool calls response
          return {
            id: 'chatcmpl-tools-123',
            object: 'chat.completion',
            created: 1677652300,
            model: params.model,
            system_fingerprint: 'fp_tools_123',
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: null,
                  tool_calls: [
                    {
                      id: 'call_12345xyz',
                      type: 'function',
                      function: {
                        name: 'get_weather',
                        arguments: '{"latitude":48.8566,"longitude":2.3522}',
                      },
                    },
                  ],
                },
                finish_reason: 'tool_calls',
              },
            ],
            usage: {
              prompt_tokens: 15,
              completion_tokens: 25,
              total_tokens: 40,
            },
          };
        },
      },
    };

    this.responses = {
      create: async params => {
        await new Promise(resolve => setTimeout(resolve, 10));

        // If stream is requested, return an async generator
        if (params.stream) {
          return this._createResponsesApiToolCallsStream(params);
        }

        // Non-streaming tool calls response
        return {
          id: 'resp_tools_789',
          object: 'response',
          created_at: 1677652320,
          model: params.model,
          input_text: Array.isArray(params.input) ? JSON.stringify(params.input) : params.input,
          status: 'completed',
          output: [
            {
              type: 'function_call',
              id: 'fc_12345xyz',
              call_id: 'call_12345xyz',
              name: 'get_weather',
              arguments: '{"latitude":48.8566,"longitude":2.3522}',
            },
          ],
          usage: {
            input_tokens: 8,
            output_tokens: 12,
            total_tokens: 20,
          },
        };
      },
    };
  }

  // Create a mock streaming response for chat completions with tool calls
  async *_createChatCompletionToolCallsStream(params) {
    // First chunk with tool call initialization
    yield {
      id: 'chatcmpl-stream-tools-123',
      object: 'chat.completion.chunk',
      created: 1677652305,
      model: params.model,
      choices: [
        {
          index: 0,
          delta: {
            role: 'assistant',
            tool_calls: [
              {
                index: 0,
                id: 'call_12345xyz',
                type: 'function',
                function: { name: 'get_weather', arguments: '' },
              },
            ],
          },
          finish_reason: null,
        },
      ],
    };

    // Second chunk with arguments delta
    yield {
      id: 'chatcmpl-stream-tools-123',
      object: 'chat.completion.chunk',
      created: 1677652305,
      model: params.model,
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              {
                index: 0,
                function: { arguments: '{"latitude":48.8566,"longitude":2.3522}' },
              },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
      usage: { prompt_tokens: 15, completion_tokens: 25, total_tokens: 40 },
    };
  }

  // Create a mock streaming response for responses API with tool calls
  async *_createResponsesApiToolCallsStream(params) {
    const responseId = 'resp_stream_tools_789';

    // Response created event
    yield {
      type: 'response.created',
      response: {
        id: responseId,
        object: 'response',
        created_at: 1677652310,
        model: params.model,
        status: 'in_progress',
        output: [],
        usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
      },
      sequence_number: 1,
    };

    // Function call output item added
    yield {
      type: 'response.output_item.added',
      response_id: responseId,
      output_index: 0,
      item: {
        type: 'function_call',
        id: 'fc_12345xyz',
        call_id: 'call_12345xyz',
        name: 'get_weather',
        arguments: '',
      },
      sequence_number: 2,
    };

    // Function call arguments delta events
    yield {
      type: 'response.function_call_arguments.delta',
      response_id: responseId,
      item_id: 'fc_12345xyz',
      output_index: 0,
      delta: '{"latitude":48.8566,"longitude":2.3522}',
      sequence_number: 3,
    };

    // Function call arguments done
    yield {
      type: 'response.function_call_arguments.done',
      response_id: responseId,
      item_id: 'fc_12345xyz',
      output_index: 0,
      arguments: '{"latitude":48.8566,"longitude":2.3522}',
      sequence_number: 4,
    };

    // Output item done
    yield {
      type: 'response.output_item.done',
      response_id: responseId,
      output_index: 0,
      item: {
        type: 'function_call',
        id: 'fc_12345xyz',
        call_id: 'call_12345xyz',
        name: 'get_weather',
        arguments: '{"latitude":48.8566,"longitude":2.3522}',
      },
      sequence_number: 5,
    };

    // Response completed event
    yield {
      type: 'response.completed',
      response: {
        id: responseId,
        object: 'response',
        created_at: 1677652310,
        model: params.model,
        status: 'completed',
        output: [
          {
            type: 'function_call',
            id: 'fc_12345xyz',
            call_id: 'call_12345xyz',
            name: 'get_weather',
            arguments: '{"latitude":48.8566,"longitude":2.3522}',
          },
        ],
        usage: { input_tokens: 8, output_tokens: 12, total_tokens: 20 },
      },
      sequence_number: 6,
    };
  }
}

async function run() {
  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const mockClient = new MockOpenAIToolCalls({
      apiKey: 'mock-api-key',
    });

    const client = instrumentOpenAiClient(mockClient);

    const weatherTool = {
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
    };

    const message = { role: 'user', content: 'What is the weather like in Paris today?' };

    // Test 1: Chat completion with tools (non-streaming)
    await client.chat.completions.create({
      model: 'gpt-4',
      messages: [message],
      tools: [weatherTool],
    });

    // Test 2: Chat completion with tools (streaming)
    const stream1 = await client.chat.completions.create({
      model: 'gpt-4',
      messages: [message],
      tools: [weatherTool],
      stream: true,
    });
    for await (const chunk of stream1) void chunk;

    // Test 3: Responses API with tools (non-streaming)
    await client.responses.create({
      model: 'gpt-4',
      input: [message],
      tools: [weatherTool],
    });

    // Test 4: Responses API with tools (streaming)
    const stream2 = await client.responses.create({
      model: 'gpt-4',
      input: [message],
      tools: [weatherTool],
      stream: true,
    });
    for await (const chunk of stream2) void chunk;
  });
}

run();
