import { GoogleGenAI } from '@google/genai';
import * as Sentry from '@sentry/node';
import express from 'express';

function startMockGoogleGenAIServer() {
  const app = express();
  app.use(express.json());

  // Non-streaming endpoint for models.generateContent
  app.post('/v1beta/models/:model\\:generateContent', (req, res) => {
    const { tools } = req.body;

    // Check if tools are provided to return function call response
    if (tools && tools.length > 0) {
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
      });

      res.send(response);
      return;
    }

    // Regular response without tools
    res.send({
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
    });
  });

  // Streaming endpoint for models.generateContentStream
  // And chat.sendMessageStream
  app.post('/v1beta/models/:model\\:streamGenerateContent', (req, res) => {
    const { tools } = req.body;

    // Set headers for streaming response
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Transfer-Encoding', 'chunked');

    // Create a mock stream
    const mockStream = createMockToolsStream({ tools });

    // Send chunks
    const sendChunk = async () => {
      // Testing .next() works as expected
      const { value, done } = await mockStream.next();
      if (done) {
        res.end();
        return;
      }

      res.write(`data: ${JSON.stringify(value)}\n\n`);
      setTimeout(sendChunk, 10); // Small delay between chunks
    };

    sendChunk();
  });

  return new Promise(resolve => {
    const server = app.listen(0, () => {
      resolve(server);
    });
  });
}

// Helper function to create mock stream
async function* createMockToolsStream({ tools }) {
  // Check if tools are provided to return function call response
  if (tools && tools.length > 0) {
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
    yield {
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
    return;
  }

  // Regular stream without tools
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
    responseId: 'mock-response-tools-id',
    modelVersion: 'gemini-2.0-flash-001',
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

async function run() {
  const server = await startMockGoogleGenAIServer();

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const client = new GoogleGenAI({
      apiKey: 'mock-api-key',
      httpOptions: { baseUrl: `http://localhost:${server.address().port}` },
    });

    // Test 1: Non-streaming with tools
    await client.models.generateContent({
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
    const stream = await client.models.generateContentStream({
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
    await client.models.generateContent({
      model: 'gemini-2.0-flash-001',
      contents: 'Tell me about the weather.',
    });
  });

  server.close();
}

run();
