import { GoogleGenAI } from '@google/genai';
import * as Sentry from '@sentry/node';
import express from 'express';
import {
  googleGenAiResponse,
  googleGenAiStreamChunks,
  startMockServer,
  streamSseEvents,
} from '@sentry-internal/node-integration-tests';

function startMockGoogleGenAIServer() {
  const app = express();
  app.use(express.json());

  // Non-streaming endpoint for models.generateContent
  app.post('/v1beta/models/:model\\:generateContent', (req, res) => {
    if (req.body.tools?.length > 0) {
      res.send(
        googleGenAiResponse({
          parts: [
            'I need to check the light status first.',
            {
              functionCall: {
                id: 'call_light_control_1',
                name: 'controlLight',
                args: { brightness: 0.3, colorTemperature: 'warm' },
              },
            },
          ],
          usage: { promptTokenCount: 15, candidatesTokenCount: 8 },
        }),
      );
      return;
    }

    // Regular response without tools
    res.send(googleGenAiResponse({ parts: ['Mock response from Google GenAI without tools!'] }));
  });

  // Streaming endpoint for models.generateContentStream and chat.sendMessageStream
  app.post('/v1beta/models/:model\\:streamGenerateContent', (req, res) => {
    const withTools = req.body.tools?.length > 0;
    const chunks = googleGenAiStreamChunks({
      parts: withTools
        ? [
            'Let me control the lights for you.',
            {
              functionCall: {
                id: 'call_light_stream_1',
                name: 'controlLight',
                args: { brightness: 0.5, colorTemperature: 'cool' },
              },
            },
            ' Done!',
          ]
        : ['Mock streaming response', ' from Google GenAI!'],
      responseId: 'mock-response-tools-id',
      modelVersion: 'gemini-2.0-flash-001',
      usage: withTools ? { promptTokenCount: 12, candidatesTokenCount: 10 } : undefined,
    });
    streamSseEvents(res, chunks);
  });

  return startMockServer(app);
}

async function run() {
  const server = await startMockGoogleGenAIServer();

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const client = new GoogleGenAI({
      apiKey: 'mock-api-key',
      httpOptions: { baseUrl: server.url },
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
