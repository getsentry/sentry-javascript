import { instrumentOpenAiClient } from '@sentry/core';
import * as Sentry from '@sentry/node';

class MockOpenAI {
  constructor(config) {
    this.apiKey = config.apiKey;

    this.chat = {
      completions: {
        create: async params => {
          // Simulate processing time
          await new Promise(resolve => setTimeout(resolve, 10));

          if (params.model === 'error-model') {
            const error = new Error('Model not found');
            error.status = 404;
            error.headers = { 'x-request-id': 'mock-request-123' };
            throw error;
          }

          // If stream is requested, return an async generator
          if (params.stream) {
            return this._createChatCompletionStream(params);
          }

          return {
            id: 'chatcmpl-mock123',
            object: 'chat.completion',
            created: 1677652288,
            model: params.model,
            system_fingerprint: 'fp_44709d6fcb',
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: 'Hello from OpenAI mock!',
                },
                finish_reason: 'stop',
              },
            ],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 15,
              total_tokens: 25,
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
          return this._createResponsesApiStream(params);
        }

        return {
          id: 'resp_mock456',
          object: 'response',
          created_at: 1677652290,
          model: params.model,
          input_text: params.input,
          output_text: `Response to: ${params.input}`,
          status: 'completed',
          usage: {
            input_tokens: 5,
            output_tokens: 8,
            total_tokens: 13,
          },
        };
      },
    };

    this.embeddings = {
      create: async params => {
        await new Promise(resolve => setTimeout(resolve, 10));

        if (params.model === 'error-model') {
          const error = new Error('Model not found');
          error.status = 404;
          error.headers = { 'x-request-id': 'mock-request-123' };
          throw error;
        }

        return {
          object: 'list',
          data: [
            {
              object: 'embedding',
              embedding: [0.1, 0.2, 0.3],
              index: 0,
            },
          ],
          model: params.model,
          usage: {
            prompt_tokens: 10,
            total_tokens: 10,
          },
        };
      },
    };
  }

  // Create a mock streaming response for chat completions
  async *_createChatCompletionStream(params) {
    // First chunk with basic info
    yield {
      id: 'chatcmpl-stream-123',
      object: 'chat.completion.chunk',
      created: 1677652300,
      model: params.model,
      system_fingerprint: 'fp_stream_123',
      choices: [
        {
          index: 0,
          delta: {
            role: 'assistant',
            content: 'Hello',
          },
          finish_reason: null,
        },
      ],
    };

    // Second chunk with more content
    yield {
      id: 'chatcmpl-stream-123',
      object: 'chat.completion.chunk',
      created: 1677652300,
      model: params.model,
      system_fingerprint: 'fp_stream_123',
      choices: [
        {
          index: 0,
          delta: {
            content: ' from OpenAI streaming!',
          },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 12,
        completion_tokens: 18,
        total_tokens: 30,
        completion_tokens_details: {
          accepted_prediction_tokens: 0,
          audio_tokens: 0,
          reasoning_tokens: 0,
          rejected_prediction_tokens: 0,
        },
        prompt_tokens_details: {
          audio_tokens: 0,
          cached_tokens: 0,
        },
      },
    };
  }

  // Create a mock streaming response for responses API
  async *_createResponsesApiStream(params) {
    // Response created event
    yield {
      type: 'response.created',
      response: {
        id: 'resp_stream_456',
        object: 'response',
        created_at: 1677652310,
        model: params.model,
        status: 'in_progress',
        error: null,
        incomplete_details: null,
        instructions: params.instructions,
        max_output_tokens: 1000,
        parallel_tool_calls: false,
        previous_response_id: null,
        reasoning: {
          effort: null,
          summary: null,
        },
        store: false,
        temperature: 0.7,
        text: {
          format: {
            type: 'text',
          },
        },
        tool_choice: 'auto',
        top_p: 1.0,
        truncation: 'disabled',
        user: null,
        metadata: {},
        output: [],
        output_text: '',
        usage: {
          input_tokens: 0,
          output_tokens: 0,
          total_tokens: 0,
        },
      },
      sequence_number: 1,
    };

    // Response in progress with output text delta
    yield {
      type: 'response.output_text.delta',
      delta: 'Streaming response to: ',
      sequence_number: 2,
    };

    yield {
      type: 'response.output_text.delta',
      delta: params.input,
      sequence_number: 3,
    };

    // Response completed event
    yield {
      type: 'response.completed',
      response: {
        id: 'resp_stream_456',
        object: 'response',
        created_at: 1677652310,
        model: params.model,
        status: 'completed',
        error: null,
        incomplete_details: null,
        instructions: params.instructions,
        max_output_tokens: 1000,
        parallel_tool_calls: false,
        previous_response_id: null,
        reasoning: {
          effort: null,
          summary: null,
        },
        store: false,
        temperature: 0.7,
        text: {
          format: {
            type: 'text',
          },
        },
        tool_choice: 'auto',
        top_p: 1.0,
        truncation: 'disabled',
        user: null,
        metadata: {},
        output: [],
        output_text: params.input,
        usage: {
          input_tokens: 6,
          output_tokens: 10,
          total_tokens: 16,
        },
      },
      sequence_number: 4,
    };
  }
}

async function run() {
  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const mockClient = new MockOpenAI({
      apiKey: 'mock-api-key',
    });

    const client = instrumentOpenAiClient(mockClient);

    // First test: basic chat completion
    await client.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'What is the capital of France?' },
      ],
      temperature: 0.7,
      max_tokens: 100,
    });

    // Second test: responses API
    await client.responses.create({
      model: 'gpt-3.5-turbo',
      input: 'Translate this to French: Hello',
      instructions: 'You are a translator',
    });

    // Third test: error handling in chat completions
    try {
      await client.chat.completions.create({
        model: 'error-model',
        messages: [{ role: 'user', content: 'This will fail' }],
      });
    } catch {
      // Error is expected and handled
    }

    // Fourth test: chat completions streaming
    const stream1 = await client.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Tell me about streaming' },
      ],
      stream: true,
      temperature: 0.8,
    });

    // Consume the stream to trigger span instrumentation
    for await (const chunk of stream1) {
      // Stream chunks are processed automatically by instrumentation
      void chunk; // Prevent unused variable warning
    }

    // Fifth test: responses API streaming
    const stream2 = await client.responses.create({
      model: 'gpt-4',
      input: 'Test streaming responses API',
      instructions: 'You are a streaming assistant',
      stream: true,
    });

    for await (const chunk of stream2) {
      void chunk;
    }

    // Sixth test: error handling in streaming context
    try {
      const errorStream = await client.chat.completions.create({
        model: 'error-model',
        messages: [{ role: 'user', content: 'This will fail' }],
        stream: true,
      });

      // Try to consume the stream (this should not execute)
      for await (const chunk of errorStream) {
        void chunk;
      }
    } catch {
      // Error is expected and handled
    }

    // Seventh test: embeddings API
    await client.embeddings.create({
      input: 'Embedding test!',
      model: 'text-embedding-3-small',
      dimensions: 1536,
      encoding_format: 'float',
    });

    // Eighth test: embeddings API error model
    try {
      await client.embeddings.create({
        input: 'Error embedding test!',
        model: 'error-model',
      });
    } catch {
      // Error is expected and handled
    }
  });
}

run();
