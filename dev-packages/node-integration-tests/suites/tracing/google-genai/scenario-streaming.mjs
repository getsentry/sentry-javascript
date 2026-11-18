import { GoogleGenAI } from '@google/genai';
import * as Sentry from '@sentry/node';
import express from 'express';
import { googleGenAiStreamChunks, startMockServer, streamSseEvents } from '@sentry-internal/node-integration-tests';

function startMockGoogleGenAIServer() {
  const app = express();
  app.use(express.json());

  // Streaming endpoint for models.generateContentStream and chat.sendMessageStream
  app.post('/v1beta/models/:model\\:streamGenerateContent', (req, res) => {
    const model = req.params.model;

    if (model === 'error-model') {
      res.status(404).set('x-request-id', 'mock-request-123').end('Model not found');
      return;
    }

    const chunks =
      model === 'blocked-model'
        ? BLOCKED_CHUNKS
        : googleGenAiStreamChunks({
            parts: ['Hello! ', 'This is a streaming ', 'response from Google GenAI!'],
            responseId: 'mock-response-streaming-id',
            modelVersion: 'gemini-1.5-pro',
          });
    streamSseEvents(res, chunks);
  });

  return startMockServer(app);
}

// The second chunk follows a blocked prompt, so its text must not be recorded.
const BLOCKED_CHUNKS = [
  {
    promptFeedback: {
      blockReason: 'SAFETY',
      blockReasonMessage: 'The prompt was blocked due to safety concerns',
    },
    responseId: 'mock-blocked-response-streaming-id',
    modelVersion: 'gemini-1.5-pro',
  },
  { candidates: [{ content: { parts: [{ text: 'This should not be processed' }], role: 'model' }, index: 0 }] },
];

async function run() {
  const server = await startMockGoogleGenAIServer();

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const client = new GoogleGenAI({
      apiKey: 'mock-api-key',
      httpOptions: { baseUrl: server.url },
    });

    // Test 1: models.generateContentStream (streaming)
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

    // Test 2: chat.sendMessageStream (streaming)
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

    // Test 3: Blocked content streaming (should trigger error handling)
    try {
      const blockedStreamResponse = await client.models.generateContentStream({
        model: 'blocked-model',
        config: {
          temperature: 0.7,
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: 'This should be blocked' }],
          },
        ],
      });

      // Consume the blocked stream
      for await (const _ of blockedStreamResponse) {
        void _;
      }
    } catch {
      // Expected: The stream should be processed, but the span should be marked with error status
      // The error handling happens in the streaming instrumentation, not as a thrown error
    }

    // Test 4: Error handling for streaming
    try {
      const errorStreamResponse = await client.models.generateContentStream({
        model: 'error-model',
        config: {
          temperature: 0.7,
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: 'This will fail' }],
          },
        ],
      });

      // Consume the error stream
      for await (const _ of errorStreamResponse) {
        void _;
      }
    } catch {
      // Expected error
    }
  });

  server.close();
}

run();
