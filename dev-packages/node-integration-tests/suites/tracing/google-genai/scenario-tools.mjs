import { instrumentGoogleGenAIClient } from '@sentry/core';
import * as Sentry from '@sentry/node';

class MockGoogleGenAI {
  constructor(config) {
    this.apiKey = config.apiKey;

    this.models = {
      generateContent: async params => {
        // Simulate processing time
        await new Promise(resolve => setTimeout(resolve, 10));

        // Check if tools are provided to return function call response
        if (params.config?.tools && params.config.tools.length > 0) {
          const response = {
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: 'I need to check the light status first.',
                    },
                    {
                      functionCall: {
                        id: 'call_light_control_1',
                        name: 'controlLight',
                        args: {
                          brightness: 0.3,
                          colorTemperature: 'warm',
                        },
                      },
                    },
                  ],
                  role: 'model',
                },
                finishReason: 'stop',
                index: 0,
              },
            ],
            usageMetadata: {
              promptTokenCount: 15,
              candidatesTokenCount: 8,
              totalTokenCount: 23,
            },
          };

          // Add functionCalls getter, this should exist in the response object
          Object.defineProperty(response, 'functionCalls', {
            get: function () {
              return [
                {
                  id: 'call_light_control_1',
                  name: 'controlLight',
                  args: {
                    brightness: 0.3,
                    colorTemperature: 'warm',
                  },
                },
              ];
            },
            enumerable: false,
          });

          return response;
        }

        return {
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: 'Mock response from Google GenAI without tools!',
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

      generateContentStream: async params => {
        // Simulate processing time
        await new Promise(resolve => setTimeout(resolve, 10));

        // Check if tools are provided to return function call response
        if (params.config?.tools && params.config.tools.length > 0) {
          return this._createMockStreamWithTools();
        }

        return this._createMockStream();
      },
    };
  }

  // Helper method to create a mock stream with tool calls
  async *_createMockStreamWithTools() {
    // First chunk: Text response
    yield {
      candidates: [
        {
          content: {
            parts: [{ text: 'Let me control the lights for you.' }],
            role: 'model',
          },
          index: 0,
        },
      ],
      responseId: 'mock-response-tools-id',
      modelVersion: 'gemini-2.0-flash-001',
    };

    // Second chunk: Function call
    const functionCallChunk = {
      candidates: [
        {
          content: {
            parts: [
              {
                functionCall: {
                  id: 'call_light_stream_1',
                  name: 'controlLight',
                  args: {
                    brightness: 0.5,
                    colorTemperature: 'cool',
                  },
                },
              },
            ],
            role: 'model',
          },
          index: 0,
        },
      ],
    };

    // Add functionCalls getter to streaming chunk
    Object.defineProperty(functionCallChunk, 'functionCalls', {
      get: function () {
        return [
          {
            id: 'call_light_stream_1',
            name: 'controlLight',
            args: {
              brightness: 0.5,
              colorTemperature: 'cool',
            },
          },
        ];
      },
      enumerable: false,
    });

    yield functionCallChunk;

    // Final chunk: End with finish reason and usage metadata
    yield {
      candidates: [
        {
          content: {
            parts: [{ text: ' Done!' }], // Additional text in final chunk
            role: 'model',
          },
          finishReason: 'STOP',
          index: 0,
        },
      ],
      usageMetadata: {
        promptTokenCount: 12,
        candidatesTokenCount: 10,
        totalTokenCount: 22,
      },
    };
  }

  // Helper method to create a regular mock stream without tools
  async *_createMockStream() {
    // First chunk: Start of response
    yield {
      candidates: [
        {
          content: {
            parts: [{ text: 'Mock streaming response' }],
            role: 'model',
          },
          index: 0,
        },
      ],
      responseId: 'mock-response-id',
      modelVersion: 'gemini-1.5-flash',
    };

    // Final chunk
    yield {
      candidates: [
        {
          content: {
            parts: [{ text: ' from Google GenAI!' }],
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
}

async function run() {
  const genAI = new MockGoogleGenAI({ apiKey: 'test-api-key' });
  const instrumentedClient = instrumentGoogleGenAIClient(genAI);

  await Sentry.startSpan({ name: 'main', op: 'function' }, async () => {
    // Test 1: Non-streaming with tools
    await instrumentedClient.models.generateContent({
      model: 'gemini-2.0-flash-001',
      contents: 'Dim the lights so the room feels cozy and warm.',
      config: {
        tools: [
          {
            functionDeclarations: [
              {
                name: 'controlLight',
                parametersJsonSchema: {
                  type: 'object',
                  properties: {
                    brightness: {
                      type: 'number',
                    },
                    colorTemperature: {
                      type: 'string',
                    },
                  },
                  required: ['brightness', 'colorTemperature'],
                },
              },
            ],
          },
        ],
      },
    });

    // Test 2: Streaming with tools
    const stream = await instrumentedClient.models.generateContentStream({
      model: 'gemini-2.0-flash-001',
      contents: 'Turn on the lights with medium brightness.',
      config: {
        tools: [
          {
            functionDeclarations: [
              {
                name: 'controlLight',
                parametersJsonSchema: {
                  type: 'object',
                  properties: {
                    brightness: {
                      type: 'number',
                    },
                    colorTemperature: {
                      type: 'string',
                    },
                  },
                  required: ['brightness', 'colorTemperature'],
                },
              },
            ],
          },
        ],
      },
    });

    // Consume the stream to trigger instrumentation
    for await (const _ of stream) {
      void _;
    }

    // Test 3: Without tools for comparison
    await instrumentedClient.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: 'Tell me about the weather.',
    });
  });
}

run();
