import type { OpenAiClient } from '@sentry/core';

export class MockOpenAi implements OpenAiClient {
  public chat?: Record<string, unknown> | undefined;
  public responses?: {
    create: (...args: unknown[]) => Promise<unknown>;
  };

  public apiKey: string;

  public constructor(config: { apiKey: string }) {
    this.apiKey = config.apiKey;

    this.chat = {
      completions: {
        create: async (...args: unknown[]) => {
          const params = args[0] as { model: string; stream?: boolean };
          // Simulate processing time
          await new Promise(resolve => setTimeout(resolve, 10));

          if (params.model === 'error-model') {
            const error = new Error('Model not found');
            (error as unknown as { status: number }).status = 404;
            (error as unknown as { headers: Record<string, string> }).headers = { 'x-request-id': 'mock-request-123' };
            throw error;
          }

          // If stream is requested, return an async generator
          if (params.stream) {
            return this.createChatCompletionStream(params);
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
      create: async (...args: unknown[]) => {
        const params = args[0] as { model: string; input: string; instructions: string; stream?: boolean };
        await new Promise(resolve => setTimeout(resolve, 10));

        // If stream is requested, return an async generator
        if (params.stream) {
          return this.createResponsesApiStream(params);
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
  }

  // Create a mock streaming response for chat completions
  public async *createChatCompletionStream(params: { model: string }): AsyncGenerator<unknown> {
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
  public async *createResponsesApiStream(params: {
    model: string;
    input: string;
    instructions: string;
  }): AsyncGenerator<unknown> {
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
