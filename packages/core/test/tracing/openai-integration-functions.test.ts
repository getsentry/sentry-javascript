import { beforeEach, describe, expect, it } from 'vitest';
import type { OpenAiClient } from '../../src';
import { instrumentOpenAiClient } from '../../src/tracing/openai';

interface FullOpenAIClient {
  chat: {
    completions: {
      create: (params: ChatCompletionParams) => Promise<ChatCompletionResponse>;
      parse: (params: ParseCompletionParams) => Promise<ParseCompletionResponse>;
    };
  };
}
interface ChatCompletionParams {
  model: string;
  messages: Array<{ role: string; content: string }>;
}

interface ChatCompletionResponse {
  id: string;
  model: string;
  choices: Array<{ message: { content: string } }>;
}

interface ParseCompletionParams {
  model: string;
  messages: Array<{ role: string; content: string }>;
  response_format: {
    type: string;
    json_schema: {
      name: string;
      schema: {
        type: string;
        properties: Record<string, { type: string }>;
      };
    };
  };
}

interface ParseCompletionResponse {
  id: string;
  model: string;
  choices: Array<{
    message: {
      content: string;
      parsed: { name: string; age: number };
    };
  }>;
  parsed: { name: string; age: number };
}

/**
 * Mock OpenAI client that simulates the private field behavior
 * that causes the "Cannot read private member" error
 */
class MockOpenAIClient implements FullOpenAIClient {
  // Simulate private fields using WeakMap (similar to how TypeScript private fields work)
  static #privateData = new WeakMap();

  // Simulate instrumented methods
  chat = {
    completions: {
      create: async (params: ChatCompletionParams): Promise<ChatCompletionResponse> => {
        this.#buildURL('/chat/completions');
        return { id: 'test', model: params.model, choices: [{ message: { content: 'Hello!' } }] };
      },

      // This is NOT instrumented
      parse: async (params: ParseCompletionParams): Promise<ParseCompletionResponse> => {
        this.#buildURL('/chat/completions');
        return {
          id: 'test',
          model: params.model,
          choices: [
            {
              message: {
                content: 'Hello!',
                parsed: { name: 'John', age: 30 },
              },
            },
          ],
          parsed: { name: 'John', age: 30 },
        };
      },
    },
  };

  constructor() {
    MockOpenAIClient.#privateData.set(this, {
      apiKey: 'test-key',
      baseURL: 'https://api.openai.com',
    });
  }

  // Simulate the buildURL method that accesses private fields
  #buildURL(path: string): string {
    const data = MockOpenAIClient.#privateData.get(this);
    if (!data) {
      throw new TypeError('Cannot read private member from an object whose class did not declare it');
    }
    return `${data.baseURL}${path}`;
  }
}

describe('OpenAI Integration Private Field Fix', () => {
  let mockClient: MockOpenAIClient;
  let instrumentedClient: FullOpenAIClient & OpenAiClient;

  beforeEach(() => {
    mockClient = new MockOpenAIClient();
    instrumentedClient = instrumentOpenAiClient(mockClient as unknown as OpenAiClient) as FullOpenAIClient &
      OpenAiClient;
  });

  it('should work with instrumented methods (chat.completions.create)', async () => {
    // This should work because it's instrumented and we handle it properly
    const result = await instrumentedClient.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'test' }],
    });

    expect(result.model).toBe('gpt-4');
  });

  it('should work with non-instrumented methods without breaking private fields', async () => {
    // The parse method should work now with our fix - previously it would throw:
    // "TypeError: Cannot read private member from an object whose class did not declare it"

    await expect(
      instrumentedClient.chat.completions.parse({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Extract name and age from: John is 30 years old' }],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'person',
            schema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                age: { type: 'number' },
              },
            },
          },
        },
      }),
    ).resolves.toBeDefined();
  });

  it('should preserve the original context for all method calls', async () => {
    // Verify that 'this' context is preserved for instrumented methods
    const createResult = await instrumentedClient.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'test' }],
    });

    expect(createResult.model).toBe('gpt-4');

    // Verify that 'this' context is preserved for non-instrumented methods
    const parseResult = await instrumentedClient.chat.completions.parse({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Extract name and age from: John is 30 years old' }],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'person',
          schema: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              age: { type: 'number' },
            },
          },
        },
      },
    });

    expect(parseResult.parsed).toEqual({ name: 'John', age: 30 });
  });

  it('should handle nested object access correctly', async () => {
    expect(typeof instrumentedClient.chat.completions.create).toBe('function');
    expect(typeof instrumentedClient.chat.completions.parse).toBe('function');
  });

  it('should work with non-instrumented methods', async () => {
    const result = await instrumentedClient.chat.completions.parse({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Extract name and age from: John is 30 years old' }],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'person',
          schema: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              age: { type: 'number' },
            },
          },
        },
      },
    });

    expect(result.model).toBe('gpt-4');
    expect(result.parsed).toEqual({ name: 'John', age: 30 });

    // Verify we can access the parse method without issues
    expect(typeof instrumentedClient.chat.completions.parse).toBe('function');
  });
});
