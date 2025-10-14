// Mock Google GenAI client for browser testing
export class MockGoogleGenAI {
  constructor(config) {
    this.apiKey = config.apiKey;

    // models.generateContent functionality
    this.models = {
      generateContent: async (...args) => {
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
        const params = args[0];
        const model = params.model;

        return {
          modelVersion: model,
          sendMessage: async (..._messageArgs) => {
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
