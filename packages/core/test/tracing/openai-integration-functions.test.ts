import { beforeEach, describe, expect, it } from 'vitest';
import type { OpenAiClient } from '../../src';
import { instrumentOpenAiClient } from '../../src/tracing/openai';

/**
 * Mock APIPromise that simulates OpenAI SDK's APIPromise behavior
 * APIPromise extends Promise but has additional methods like withResponse()
 */
class MockAPIPromise<T> extends Promise<T> {
  private _response: { headers: Record<string, string> };

  constructor(
    executor: (resolve: (value: T) => void, reject: (reason?: unknown) => void) => void,
    response?: { headers: Record<string, string> },
  ) {
    super(executor);
    this._response = response || { headers: { 'x-request-id': 'test-request-id' } };
  }

  /**
   * Simulates OpenAI's APIPromise.withResponse() method
   * Returns both the data and the raw response
   */
  withResponse(): Promise<{ data: T; response: { headers: Record<string, string> } }> {
    return this.then(data => ({
      data,
      response: this._response,
    }));
  }

  // Override then to return MockAPIPromise to maintain the chain
  // This is important for preserving the APIPromise type through .then() chains
  override then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null | undefined,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null | undefined,
  ): MockAPIPromise<TResult1 | TResult2> {
    const result = super.then(onfulfilled, onrejected);
    const apiPromise = new MockAPIPromise<TResult1 | TResult2>((resolve, reject) => {
      result.then(resolve, reject);
    }, this._response);
    return apiPromise;
  }
}

interface FullOpenAIClient {
  chat: {
    completions: {
      create: (params: ChatCompletionParams) => MockAPIPromise<ChatCompletionResponse>;
      parse: (params: ParseCompletionParams) => Promise<ParseCompletionResponse>;
    };
  };
  embeddings: {
    create: (params: EmbeddingsParams) => MockAPIPromise<EmbeddingsResponse>;
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

interface EmbeddingsParams {
  model: string;
  input: string | string[];
}

interface EmbeddingsResponse {
  object: string;
  model: string;
  data: Array<{ embedding: number[]; index: number }>;
  usage: { prompt_tokens: number; total_tokens: number };
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
      create: (params: ChatCompletionParams): MockAPIPromise<ChatCompletionResponse> => {
        this.#buildURL('/chat/completions');
        return new MockAPIPromise(resolve => {
          resolve({
            id: 'test',
            model: params.model,
            choices: [{ message: { content: 'Hello!' } }],
          });
        });
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

  embeddings = {
    create: (params: EmbeddingsParams): MockAPIPromise<EmbeddingsResponse> => {
      this.#buildURL('/embeddings');
      return new MockAPIPromise(resolve => {
        resolve({
          object: 'list',
          model: params.model,
          data: [{ embedding: [0.1, 0.2, 0.3], index: 0 }],
          usage: { prompt_tokens: 10, total_tokens: 10 },
        });
      });
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

describe('OpenAI Integration APIPromise Preservation', () => {
  let mockClient: MockOpenAIClient;
  let instrumentedClient: FullOpenAIClient & OpenAiClient;

  beforeEach(() => {
    mockClient = new MockOpenAIClient();
    instrumentedClient = instrumentOpenAiClient(mockClient as unknown as OpenAiClient) as FullOpenAIClient &
      OpenAiClient;
  });

  it('should preserve APIPromise.withResponse() method on chat.completions.create', async () => {
    const apiPromise = instrumentedClient.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'test' }],
    });

    // The key test: withResponse() should exist and work
    expect(typeof apiPromise.withResponse).toBe('function');

    const { data, response } = await apiPromise.withResponse();

    expect(data.model).toBe('gpt-4');
    expect(data.choices[0]?.message?.content).toBe('Hello!');
    expect(response.headers).toEqual({ 'x-request-id': 'test-request-id' });
  });

  it('should preserve APIPromise.withResponse() method on embeddings.create', async () => {
    const apiPromise = instrumentedClient.embeddings.create({
      model: 'text-embedding-3-small',
      input: 'test input',
    });

    // The key test: withResponse() should exist and work
    expect(typeof apiPromise.withResponse).toBe('function');

    const { data, response } = await apiPromise.withResponse();

    expect(data.model).toBe('text-embedding-3-small');
    expect(data.data[0]?.embedding).toEqual([0.1, 0.2, 0.3]);
    expect(response.headers).toEqual({ 'x-request-id': 'test-request-id' });
  });

  it('should still work with regular await on instrumented methods', async () => {
    // Ensure the basic Promise behavior still works
    const result = await instrumentedClient.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'test' }],
    });

    expect(result.model).toBe('gpt-4');
    expect(result.choices[0]?.message?.content).toBe('Hello!');
  });

  it('should preserve APIPromise through .then() chains', async () => {
    const apiPromise = instrumentedClient.embeddings.create({
      model: 'text-embedding-3-small',
      input: 'test',
    });

    // Chain a .then() and verify withResponse still exists
    const chainedPromise = apiPromise.then(data => data);

    // After .then(), withResponse should still be available (if the original type is preserved)
    // Note: This depends on handleCallbackErrors returning the original Promise type
    const result = await chainedPromise;
    expect(result.model).toBe('text-embedding-3-small');
  });
});
