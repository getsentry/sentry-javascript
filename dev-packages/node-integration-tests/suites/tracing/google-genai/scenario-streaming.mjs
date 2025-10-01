import { GoogleGenAI } from '@google/genai';
import * as Sentry from '@sentry/node';
import express from 'express';

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

    // Set headers for streaming response
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Transfer-Encoding', 'chunked');

    // Create a mock stream
    const mockStream = createMockStream(model);

    // Send chunks
    const sendChunk = async () => {
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
async function* createMockStream(model) {
  if (model === 'blocked-model') {
    // First chunk: Contains promptFeedback with blockReason
    yield {
      promptFeedback: {
        blockReason: 'SAFETY',
        blockReasonMessage: 'The prompt was blocked due to safety concerns',
      },
      responseId: 'mock-blocked-response-streaming-id',
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
    };
    return;
  }

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
    responseId: 'mock-response-streaming-id',
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

async function run() {
  const server = await startMockGoogleGenAIServer();

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const client = new GoogleGenAI({
      apiKey: 'mock-api-key',
      httpOptions: { baseUrl: `http://localhost:${server.address().port}` },
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
