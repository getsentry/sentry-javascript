// Mock Google GenAI client for browser testing
export class MockGoogleGenAI {
  constructor(config) {
    // eslint-disable-next-line no-console
    console.log('[Mock Google GenAI] Constructor called with config:', config);
    this.apiKey = config.apiKey;

    // models.generateContent functionality
    this.models = {
      generateContent: async (...args) => {
        // eslint-disable-next-line no-console
        console.log('[Mock Google GenAI] models.generateContent called with args:', args);
        const params = args[0];
        // Simulate processing time
        await new Promise(resolve => setTimeout(resolve, 10));

        if (params.model === 'error-model') {
          const error = new Error('Model not found');
          error.status = 404;
          error.headers = { 'x-request-id': 'mock-request-123' };
          throw error;
        }

        return {
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: 'Hello from Google GenAI mock!',
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
      generateContentStream: async () => {
        // Return a promise that resolves to an async generator
        return (async function* () {
          yield {
            candidates: [
              {
                content: {
                  parts: [{ text: 'Streaming response' }],
                  role: 'model',
                },
                finishReason: 'stop',
                index: 0,
              },
            ],
          };
        })();
      },
    };

    // chats.create implementation
    this.chats = {
      create: (...args) => {
        // eslint-disable-next-line no-console
        console.log('[Mock Google GenAI] chats.create called with args:', args);
        const params = args[0];
        const model = params.model;

        return {
          modelVersion: model,
          sendMessage: async (..._messageArgs) => {
            // eslint-disable-next-line no-console
            console.log('[Mock Google GenAI] chat.sendMessage called with args:', _messageArgs);
            // Simulate processing time
            await new Promise(resolve => setTimeout(resolve, 10));

            const response = {
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        text: 'This is a joke from the chat!',
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
              modelVersion: model, // Include model version in response
            };
            // eslint-disable-next-line no-console
            console.log('[Mock Google GenAI] Returning response:', response);
            return response;
          },
          sendMessageStream: async () => {
            // Return a promise that resolves to an async generator
            return (async function* () {
              yield {
                candidates: [
                  {
                    content: {
                      parts: [{ text: 'Streaming chat response' }],
                      role: 'model',
                    },
                    finishReason: 'stop',
                    index: 0,
                  },
                ],
              };
            })();
          },
        };
      },
    };
  }
}
