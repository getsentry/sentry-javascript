import { GoogleGenAI } from '@google/genai';
import * as Sentry from '@sentry/node';
import express from 'express';
import { googleGenAiResponse, startMockServer, streamSseEvents } from '@sentry-internal/node-integration-tests';

function startMockGoogleServer() {
  const app = express();
  app.use(express.json());

  const response = googleGenAiResponse({ parts: ['Paris.'] });
  app.post('/v1beta/models/:model\\:generateContent', (_req, res) => {
    res.send(response);
  });
  app.post('/v1beta/models/:model\\:streamGenerateContent', (_req, res) => {
    streamSseEvents(res, [response]);
  });

  return startMockServer(app);
}

async function run() {
  const server = await startMockGoogleServer();

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const client = new GoogleGenAI({
      apiKey: 'mock-api-key',
      httpOptions: { baseUrl: server.url },
    });

    await Sentry.withScope(async scope => {
      scope.setTag('privacy', 'public');
      await client.models.generateContent({ model: 'gemini-public', contents: 'Public: capital of France?' });
    });

    await Sentry.withScope(async scope => {
      scope.setTag('privacy', 'private');
      await client.models.generateContent({ model: 'gemini-private', contents: 'Private: capital of France?' });

      // Changing the tag after a call started must not change its outputs decision.
      const stream = await client.models.generateContentStream({
        model: 'gemini-public-stream',
        contents: 'Public: capital of France?',
      });
      Sentry.getCurrentScope().setTag('privacy', 'public');
      for await (const chunk of stream) {
        void chunk;
      }
    });
  });

  server.close();
}

run();
