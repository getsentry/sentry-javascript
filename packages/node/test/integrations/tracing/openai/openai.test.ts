import type { OpenAiClient } from '@sentry/core';
import { instrumentOpenAiClient } from '@sentry/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock OpenAI client structures
const mockStreamResponse = {
  async *[Symbol.asyncIterator]() {
    // Chat completion chunks
    yield {
      id: 'chatcmpl-123',
      object: 'chat.completion.chunk',
      created: 1677652288,
      model: 'gpt-4',
      choices: [
        {
          index: 0,
          delta: { content: 'Hello' },
          finish_reason: null,
        },
      ],
    };
    yield {
      id: 'chatcmpl-123',
      object: 'chat.completion.chunk',
      created: 1677652288,
      model: 'gpt-4',
      choices: [
        {
          index: 0,
          delta: { content: ' world!' },
          finish_reason: null,
        },
      ],
    };
    yield {
      id: 'chatcmpl-123',
      object: 'chat.completion.chunk',
      created: 1677652288,
      model: 'gpt-4',
      choices: [
        {
          index: 0,
          delta: {},
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
      },
    };
  },
};

const mockResponsesApiStream = {
  async *[Symbol.asyncIterator]() {
    // Responses API events
    yield {
      type: 'response.created',
      response: {
        id: 'resp_123',
        object: 'response',
        created_at: 1677652288,
        model: 'gpt-4',
        status: 'in_progress',
      },
    };
    yield {
      type: 'response.output_text.delta',
      delta: { text: 'Hello' },
    };
    yield {
      type: 'response.output_text.delta',
      delta: { text: ' world!' },
    };
    yield {
      type: 'response.completed',
      response: {
        id: 'resp_123',
        object: 'response',
        created_at: 1677652288,
        model: 'gpt-4',
        status: 'completed',
        usage: {
          input_tokens: 10,
          output_tokens: 5,
          total_tokens: 15,
        },
      },
    };
  },
};

describe('OpenAI Streaming Integration', () => {
  let mockClient: OpenAiClient;
  let startSpanMock: any;
  let setAttributesMock: any;

  beforeEach(() => {
    setAttributesMock = vi.fn();
    startSpanMock = vi.fn((options, callback) => {
      const span = { setAttributes: setAttributesMock };
      return callback(span);
    });

    // Mock Sentry's startSpan
    vi.mock('@sentry/core', async () => {
      const actual = await vi.importActual('@sentry/core');
      return {
        ...actual,
        startSpan: startSpanMock,
        getCurrentScope: () => ({
          getClient: () => ({
            getIntegrationByName: () => ({ options: { recordInputs: true, recordOutputs: true } }),
            getOptions: () => ({ sendDefaultPii: true }),
          }),
        }),
      };
    });

    // Create mock OpenAI client
    mockClient = {
      chat: {
        completions: {
          create: vi.fn(),
        },
      },
      responses: {
        create: vi.fn(),
      },
    };
  });

  describe('Chat Completion Streaming', () => {
    it('should instrument streaming chat completions', async () => {
      mockClient.chat.completions.create.mockResolvedValue(mockStreamResponse);
      const instrumentedClient = instrumentOpenAiClient(mockClient);

      const params = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Say hello' }],
        stream: true,
      };

      const stream = await instrumentedClient.chat.completions.create(params);

      // Consume the stream
      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(3);
      expect(startSpanMock).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'chat gpt-4',
          op: 'gen_ai.chat',
          attributes: expect.objectContaining({
            'gen_ai.system': 'openai',
            'gen_ai.operation.name': 'chat',
            'gen_ai.request.model': 'gpt-4',
            'gen_ai.request.stream': true,
          }),
        }),
        expect.any(Function),
      );

      // Check that attributes were set after streaming
      expect(setAttributesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          'openai.response.id': 'chatcmpl-123',
          'gen_ai.response.id': 'chatcmpl-123',
          'openai.response.model': 'gpt-4',
          'gen_ai.response.model': 'gpt-4',
        }),
      );

      expect(setAttributesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          'openai.usage.prompt_tokens': 10,
          'gen_ai.usage.input_tokens': 10,
          'openai.usage.completion_tokens': 5,
          'gen_ai.usage.output_tokens': 5,
          'gen_ai.usage.total_tokens': 15,
        }),
      );

      expect(setAttributesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          'gen_ai.response.finish_reasons': JSON.stringify(['stop']),
          'gen_ai.response.text': JSON.stringify(['Hello', ' world!']),
        }),
      );
    });
  });

  describe('Responses API Streaming', () => {
    it('should instrument streaming responses API', async () => {
      mockClient.responses.create.mockResolvedValue(mockResponsesApiStream);
      const instrumentedClient = instrumentOpenAiClient(mockClient);

      const params = {
        model: 'gpt-4',
        input: [{ role: 'user', content: 'Say hello' }],
        stream: true,
      };

      const stream = await instrumentedClient.responses.create(params);

      // Consume the stream
      const events = [];
      for await (const event of stream) {
        events.push(event);
      }

      expect(events).toHaveLength(4);
      expect(startSpanMock).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'chat gpt-4',
          op: 'gen_ai.chat',
          attributes: expect.objectContaining({
            'gen_ai.system': 'openai',
            'gen_ai.operation.name': 'chat',
            'gen_ai.request.model': 'gpt-4',
            'gen_ai.request.stream': true,
          }),
        }),
        expect.any(Function),
      );

      // Check that attributes were set after streaming
      expect(setAttributesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          'openai.response.id': 'resp_123',
          'gen_ai.response.id': 'resp_123',
          'openai.response.model': 'gpt-4',
          'gen_ai.response.model': 'gpt-4',
        }),
      );

      expect(setAttributesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          'openai.usage.prompt_tokens': 10,
          'gen_ai.usage.input_tokens': 10,
          'openai.usage.completion_tokens': 5,
          'gen_ai.usage.output_tokens': 5,
          'gen_ai.usage.total_tokens': 15,
        }),
      );

      expect(setAttributesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          'gen_ai.response.finish_reasons': JSON.stringify(['completed']),
          'gen_ai.response.text': JSON.stringify(['Hello', ' world!']),
        }),
      );
    });
  });

  describe('Non-streaming Responses', () => {
    it('should still handle non-streaming responses', async () => {
      const nonStreamResponse = {
        id: 'chatcmpl-456',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'Hello world!' },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      };

      mockClient.chat.completions.create.mockResolvedValue(nonStreamResponse);
      const instrumentedClient = instrumentOpenAiClient(mockClient);

      const params = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Say hello' }],
        stream: false,
      };

      const response = await instrumentedClient.chat.completions.create(params);

      expect(response).toEqual(nonStreamResponse);
      expect(startSpanMock).toHaveBeenCalledWith(
        expect.objectContaining({
          attributes: expect.objectContaining({
            'gen_ai.request.stream': false,
          }),
        }),
        expect.any(Function),
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle errors in streaming', async () => {
      const errorStream = {
        async *[Symbol.asyncIterator]() {
          yield {
            id: 'chatcmpl-789',
            object: 'chat.completion.chunk',
            created: 1677652288,
            model: 'gpt-4',
            choices: [
              {
                index: 0,
                delta: { content: 'Error' },
                finish_reason: null,
              },
            ],
          };
          throw new Error('Stream error');
        },
      };

      mockClient.chat.completions.create.mockResolvedValue(errorStream);
      const instrumentedClient = instrumentOpenAiClient(mockClient);

      const params = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Cause error' }],
        stream: true,
      };

      const stream = await instrumentedClient.chat.completions.create(params);

      await expect(async () => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const chunk of stream) {
          // Consume stream
        }
      }).rejects.toThrow('Stream error');

      // Even with error, collected data should be saved
      expect(setAttributesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          'gen_ai.response.text': JSON.stringify(['Error']),
        }),
      );
    });
  });
});
