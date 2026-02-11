import { GoogleGenAI } from '@google/genai';
import * as Sentry from '@sentry/node';
import express from 'express';

function startMockGoogleGenAIServer() {
  const app = express();
  app.use(express.json());

  app.post('/v1beta/models/:model\\:generateContent', (req, res) => {
    const model = req.params.model;

    if (model === 'error-model') {
      res.status(404).set('x-request-id', 'mock-request-123').end('Model not found');
      return;
    }

    res.send({
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
        promptTokenCount: 8,
        candidatesTokenCount: 12,
        totalTokenCount: 20,
      },
    });
  });

  return new Promise(resolve => {
    const server = app.listen(0, () => {
      resolve(server);
    });
  });
}

async function run() {
  const server = await startMockGoogleGenAIServer();

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const client = new GoogleGenAI({
      apiKey: 'mock-api-key',
      httpOptions: { baseUrl: `http://localhost:${server.address().port}` },
    });

    // Test 1: chats.create and sendMessage flow
    // This should generate two spans: one for chats.create and one for sendMessage
    const chat = client.chats.create({
      model: 'gemini-1.5-pro',
      config: {
        temperature: 0.8,
        topP: 0.9,
        maxOutputTokens: 150,
        systemInstruction: 'You are a friendly robot who likes to be funny.',
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

    // Test 3: Error handling
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

  server.close();
}

run();
