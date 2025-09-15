import { instrumentGoogleGenAIClient } from '@sentry/core';
import * as Sentry from '@sentry/node';

class MockGoogleGenAI {
  constructor(config) {
    this.apiKey = config.apiKey;

    this.models = {
      generateContent: async params => {
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
                    text: params.contents ? 'The capital of France is Paris.' : 'Mock response from Google GenAI!',
                  },
                ],
                role: 'model',
              },
              finishReason: 'stop',
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
    };

    this.chats = {
      create: options => {
        // Return a chat instance with sendMessage method and model info
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
                  finishReason: 'stop',
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
        };
      },
    };
  }
}

async function run() {
  const genAI = new MockGoogleGenAI({ apiKey: 'test-api-key' });
  const instrumentedClient = instrumentGoogleGenAIClient(genAI);

  await Sentry.startSpan({ name: 'main', op: 'function' }, async () => {
    // Test 1: chats.create and sendMessage flow
    const chat = instrumentedClient.chats.create({
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
    await instrumentedClient.models.generateContent({
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

    // Test 3: Error handling
    try {
      await instrumentedClient.models.generateContent({
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
