import type { GoogleGenAIChat, GoogleGenAIClient, GoogleGenAIResponse } from '@sentry/core';

export class MockGoogleGenAI implements GoogleGenAIClient {
  public models: {
    generateContent: (...args: unknown[]) => Promise<GoogleGenAIResponse>;
    generateContentStream: (...args: unknown[]) => Promise<AsyncGenerator<GoogleGenAIResponse, any, unknown>>;
  };
  public chats: {
    create: (...args: unknown[]) => GoogleGenAIChat;
  };
  public apiKey: string;

  public constructor(config: { apiKey: string }) {
    this.apiKey = config.apiKey;

    // models.generateContent functionality
    this.models = {
      generateContent: async (...args: unknown[]) => {
        const params = args[0] as { model: string; contents?: unknown };
        // Simulate processing time
        await new Promise(resolve => setTimeout(resolve, 10));

        if (params.model === 'error-model') {
          const error = new Error('Model not found');
          (error as unknown as { status: number }).status = 404;
          (error as unknown as { headers: Record<string, string> }).headers = { 'x-request-id': 'mock-request-123' };
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
        return (async function* (): AsyncGenerator<GoogleGenAIResponse, any, unknown> {
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
      create: (...args: unknown[]) => {
        const params = args[0] as { model: string; config?: Record<string, unknown> };
        const model = params.model;

        return {
          modelVersion: model,
          sendMessage: async (..._messageArgs: unknown[]) => {
            // Simulate processing time
            await new Promise(resolve => setTimeout(resolve, 10));

            return {
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
          },
          sendMessageStream: async () => {
            // Return a promise that resolves to an async generator
            return (async function* (): AsyncGenerator<GoogleGenAIResponse, any, unknown> {
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
