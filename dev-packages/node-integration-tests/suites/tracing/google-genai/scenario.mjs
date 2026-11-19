import { GoogleGenAI } from '@google/genai';
import * as Sentry from '@sentry/node';
import express from 'express';
import { googleGenAiResponse, startMockServer } from '@sentry-internal/node-integration-tests';

function startMockGoogleGenAIServer() {
  const app = express();
  app.use(express.json());

  app.post('/:apiVersion/models/:model\\:generateContent', (req, res) => {
    const model = req.params.model;

    if (model === 'error-model') {
      res.status(404).set('x-request-id', 'mock-request-123').end('Model not found');
      return;
    }

    res.send(googleGenAiResponse());
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

    // Test 1: chats.create and sendMessage flow
    // `chats.create()` builds a local object and emits no span; only `sendMessage` does, and it
    // reports the config given here.
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
    } catch {
      // Expected error
    }
  });

  server.close();
}

run();
