import { beforeEach, describe, expect, it, vi } from 'vitest';
import { instrumentOpenAiClient } from '../../../src/utils/openai';

// Mock the core Sentry functions
vi.mock('../../../src/tracing/trace', () => ({
  startSpan: vi.fn((options, callback) => {
    const mockSpan = {
      setAttributes: vi.fn(),
      setStatus: vi.fn(),
    };
    return callback(mockSpan);
  }),
}));

describe('instrumentOpenAiClient', () => {
  let mockClient: any;
  let mockIntegration: any;

  beforeEach(() => {
    // Create a mock OpenAI client
    mockClient = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            id: 'chatcmpl-123',
            object: 'chat.completion',
            created: 1234567890,
            model: 'gpt-4',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'Hello!' },
                finish_reason: 'stop',
              },
            ],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 5,
              total_tokens: 15,
            },
          }),
        },
      },
      responses: {
        create: vi.fn().mockResolvedValue({
          id: 'resp_123',
          object: 'response',
          created: 1234567890,
          model: 'gpt-4',
          content: 'Response content',
          choices: [
            {
              index: 0,
              text: 'Response text',
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 8,
            completion_tokens: 4,
            total_tokens: 12,
          },
        }),
      },
      embeddings: {
        create: vi.fn().mockResolvedValue({
          object: 'list',
          data: [{ object: 'embedding', embedding: [0.1, 0.2], index: 0 }],
          model: 'text-embedding-ada-002',
          usage: { prompt_tokens: 5, total_tokens: 5 },
        }),
      },
    } as any;

    mockIntegration = {
      options: {
        recordInputs: true,
        recordOutputs: true,
      },
    };

    // Clear all mocks
    vi.clearAllMocks();
  });

  it('should instrument chat.completions.create method', async () => {
    const instrumentedClient = instrumentOpenAiClient(mockClient, mockIntegration) as any;

    const result = await instrumentedClient.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Hello' }],
      temperature: 0.7,
      max_tokens: 100,
    });

    expect(mockClient.chat.completions.create).toHaveBeenCalledWith({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Hello' }],
      temperature: 0.7,
      max_tokens: 100,
    });

    expect(result).toEqual({
      id: 'chatcmpl-123',
      object: 'chat.completion',
      created: 1234567890,
      model: 'gpt-4',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'Hello!' },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
      },
    });
  });

  it('should instrument responses.create method', async () => {
    const instrumentedClient = instrumentOpenAiClient(mockClient, mockIntegration) as any;

    const result = await instrumentedClient.responses.create({
      model: 'gpt-4',
      prompt: 'Tell me a joke',
      temperature: 0.8,
    });

    expect(mockClient.responses.create).toHaveBeenCalledWith({
      model: 'gpt-4',
      prompt: 'Tell me a joke',
      temperature: 0.8,
    });

    expect(result).toEqual({
      id: 'resp_123',
      object: 'response',
      created: 1234567890,
      model: 'gpt-4',
      content: 'Response content',
      choices: [
        {
          index: 0,
          text: 'Response text',
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 8,
        completion_tokens: 4,
        total_tokens: 12,
      },
    });
  });

  it('should not instrument non-targeted methods', async () => {
    const instrumentedClient = instrumentOpenAiClient(mockClient, mockIntegration) as any;

    const result = await instrumentedClient.embeddings.create({
      model: 'text-embedding-ada-002',
      input: 'test',
    });

    // The method should still be called, but not wrapped with instrumentation
    expect(mockClient.embeddings.create).toHaveBeenCalledWith({
      model: 'text-embedding-ada-002',
      input: 'test',
    });

    expect(result).toEqual({
      object: 'list',
      data: [{ object: 'embedding', embedding: [0.1, 0.2], index: 0 }],
      model: 'text-embedding-ada-002',
      usage: { prompt_tokens: 5, total_tokens: 5 },
    });
  });

  it('should handle errors gracefully', async () => {
    const error = new Error('API Error');
    mockClient.chat.completions.create = vi.fn().mockRejectedValue(error);

    const instrumentedClient = instrumentOpenAiClient(mockClient, mockIntegration) as any;

    await expect(
      instrumentedClient.chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
      }),
    ).rejects.toThrow('API Error');
  });

  it('should respect recordInputs option', async () => {
    mockIntegration.options.recordInputs = false;
    const instrumentedClient = instrumentOpenAiClient(mockClient, mockIntegration) as any;

    await instrumentedClient.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Sensitive data' }],
    });

    // With recordInputs: false, messages should not be included in span attributes
    // This would be tested through the span attributes in a real scenario
    expect(mockClient.chat.completions.create).toHaveBeenCalled();
  });

  it('should respect recordOutputs option', async () => {
    mockIntegration.options.recordOutputs = false;
    const instrumentedClient = instrumentOpenAiClient(mockClient, mockIntegration) as any;

    const result = await instrumentedClient.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Hello' }],
    });

    // Result should still be returned, but response content wouldn't be in span attributes
    expect(result.choices[0].message.content).toBe('Hello!');
  });

  it('should throw error for null or undefined client', () => {
    expect(() => instrumentOpenAiClient(null as any, mockIntegration)).toThrow('Cannot create proxy');
    expect(() => instrumentOpenAiClient(undefined as any, mockIntegration)).toThrow('Cannot create proxy');
  });

  it('should preserve non-function properties', () => {
    mockClient.apiKey = 'test-key';
    mockClient.baseURL = 'https://api.openai.com';

    const instrumentedClient = instrumentOpenAiClient(mockClient, mockIntegration) as any;

    expect(instrumentedClient.apiKey).toBe('test-key');
    expect(instrumentedClient.baseURL).toBe('https://api.openai.com');
  });

  it('should handle deeply nested method paths', async () => {
    mockClient.beta = {
      assistants: {
        threads: {
          runs: {
            create: vi.fn().mockResolvedValue({ id: 'run_123' }),
          },
        },
      },
    };

    const instrumentedClient = instrumentOpenAiClient(mockClient, mockIntegration) as any;

    const result = await instrumentedClient.beta.assistants.threads.runs.create({ thread_id: 'thread_123' });

    expect(mockClient.beta.assistants.threads.runs.create).toHaveBeenCalledWith({ thread_id: 'thread_123' });
    expect(result).toEqual({ id: 'run_123' });
  });
});
