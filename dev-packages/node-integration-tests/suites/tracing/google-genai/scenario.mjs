import { instrumentGoogleGenAIClient } from '@sentry/core';
import * as Sentry from '@sentry/node';

// Mock Google GenAI client
class MockGoogleGenAI {
  constructor(apiKey, options = {}) {
    this.apiKey = apiKey;
    this.options = options;
  }

  get models() {
    return {
      generateContent: async (params) => {
        // Simulate processing time
        await new Promise(resolve => setTimeout(resolve, 10));

        if (params.model === 'error-model') {
          const error = new Error('Model not found');
          error.status = 404;
          throw error;
        }

        return {
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: 'Mock response from Google GenAI!',
                  },
                ],
                role: 'model',
              },
              finishReason: 'STOP',
              index: 0,
            },
          ],
          usageMetadata: {
            promptTokenCount: 8,
            candidatesTokenCount: 12,
            totalTokenCount: 20,
          },
        };
      },

      generateContentStream: async params => {
        // Simulate processing time
        await new Promise(resolve => setTimeout(resolve, 10));

        if (params.model === 'error-model') {
          const error = new Error('Model not found');
          error.status = 404;
          throw error;
        }

        if (params.model === 'blocked-model') {
          // Return a stream with blocked content in the first chunk
          return this._createBlockedMockStream();
        }

        // Return an async generator that yields chunks
        return this._createMockStream();
      },
    };
  }

  get chats() {
    return {
      create: options => {
        // Return a chat instance with sendMessage method and model info
        const self = this;
        return {
          model: options?.model || 'unknown', // Include model from create options
          sendMessage: async () => {
            // Simulate processing time
            await new Promise(resolve => setTimeout(resolve, 10));

            return {
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        text: 'Mock response from Google GenAI!',
                      },
                    ],
                    role: 'model',
                  },
                  finishReason: 'STOP',
                  index: 0,
                },
              ],
              usageMetadata: {
                promptTokenCount: 10,
                candidatesTokenCount: 15,
                totalTokenCount: 25,
              },
            };
          },

          sendMessageStream: async () => {
            // Simulate processing time
            await new Promise(resolve => setTimeout(resolve, 10));

            // Return an async generator that yields chunks
            return self._createMockStream();
          },
        };
      },
    };
  }

  // Helper method to create a mock stream that yields clear GenerateContentResponse chunks
  async *_createMockStream() {
    // First chunk: Start of response with initial text
    yield {
      candidates: [
        {
          content: {
            parts: [{ text: 'Hello! ' }],
            role: 'model',
          },
          index: 0,
        },
      ],
      responseId: 'mock-response-id',
      modelVersion: 'gemini-1.5-pro',
    };

    // Second chunk: More text content
    yield {
      candidates: [
        {
          content: {
            parts: [{ text: 'This is a streaming ' }],
            role: 'model',
          },
          index: 0,
        },
      ],
    };

    // Third chunk: Final text content
    yield {
      candidates: [
        {
          content: {
            parts: [{ text: 'response from Google GenAI!' }],
            role: 'model',
          },
          index: 0,
        },
      ],
    };

    // Final chunk: End with finish reason and usage metadata
    yield {
      candidates: [
        {
          content: {
            parts: [{ text: '' }], // Empty text in final chunk
            role: 'model',
          },
          finishReason: 'STOP',
          index: 0,
        },
      ],
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokenCount: 12,
        totalTokenCount: 22,
      },
    };
  }

  // Helper method to create a mock stream with blocked content (promptFeedback in first chunk)
  async *_createBlockedMockStream() {
    // First chunk: Contains promptFeedback with blockReason (this should trigger error handling)
    yield {
      promptFeedback: {
        blockReason: 'SAFETY',
        blockReasonMessage: 'The prompt was blocked due to safety concerns',
      },
      responseId: 'mock-blocked-response-id',
      modelVersion: 'gemini-1.5-pro',
    };

    // Note: In a real blocked scenario, there would typically be no more chunks
    // But we'll add one more to test that processing stops after the error
    yield {
      candidates: [
        {
          content: {
            parts: [{ text: 'This should not be processed' }],
            role: 'model',
          },
          index: 0,
        },
      ],
    }
  }
}

// Use the mock client instead of the real one
const GoogleGenAI = MockGoogleGenAI;

async function run() {
  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const mockClient = new GoogleGenAI('mock-api-key');
    const client = instrumentGoogleGenAIClient(mockClient);

    // Test 1: chats.create and sendMessage flow
    const chat = client.chats.create({
      model: 'gemini-1.5-pro',
      config: {
        temperature: 0.8,
        topP: 0.9,
        maxOutputTokens: 150,
      },
      history: [
        {
          role: 'user',
          parts: [{ text: 'Hello, how are you?' }],
        },
      ],
    });

    await chat.sendMessage({
      message: 'Tell me a joke',
    });

    // Test 2: models.generateContent
    await client.models.generateContent({
      model: 'gemini-1.5-flash',
      config: {
        temperature: 0.7,
        topP: 0.9,
        maxOutputTokens: 100,
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: 'What is the capital of France?' }],
        },
      ],
    });

    // Test 3: models.generateContentStream (streaming)
    const streamResponse = await client.models.generateContentStream({
      model: 'gemini-1.5-flash',
      config: {
        temperature: 0.7,
        topP: 0.9,
        maxOutputTokens: 100,
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: 'Tell me about streaming' }],
        },
      ],
    });

    // Consume the stream
    for await (const _ of streamResponse) {
      void _;
    }

    // Test 4: chat.sendMessageStream (streaming)
    const streamingChat = client.chats.create({
      model: 'gemini-1.5-pro',
      config: {
        temperature: 0.8,
        topP: 0.9,
        maxOutputTokens: 150,
      },
    });

    const chatStreamResponse = await streamingChat.sendMessageStream({
      message: 'Tell me a streaming joke',
    });

    // Consume the chat stream
    for await (const _ of chatStreamResponse) {
      void _;
    }

    // Test 5: Blocked content streaming (should trigger error handling)
    try {
      const blockedStreamResponse = await client.models.generateContentStream({
        model: 'blocked-model',
        config: {
          temperature: 0.7,
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: 'This content will be blocked' }],
          },
        ],
      });

      // Consume the stream - should encounter promptFeedback error in first chunk
      for await (const _ of blockedStreamResponse) {
        void _;
      }
    } catch (error) {
      // Expected: The stream should be processed, but the span should be marked with error status
      // The error handling happens in the streaming instrumentation, not as a thrown error
    }

    // Test 6: Error handling
    try {
      await client.models.generateContent({
        model: 'error-model',
        contents: [
          {
            role: 'user',
            parts: [{ text: 'This will fail' }],
          },
        ],
      });
    } catch (error) {
      // Expected error
    }
  });
}

run();
