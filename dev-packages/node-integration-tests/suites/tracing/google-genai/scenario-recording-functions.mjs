import { GoogleGenAI } from '@google/genai';
import * as Sentry from '@sentry/node';
import express from 'express';

const RESPONSE = {
  candidates: [{ content: { parts: [{ text: 'Paris.' }], role: 'model' }, finishReason: 'STOP', index: 0 }],
  usageMetadata: { promptTokenCount: 8, candidatesTokenCount: 2, totalTokenCount: 10 },
};

function startMockServer() {
  const app = express();
  app.use(express.json());

  app.post('/v1beta/models/:model\\:generateContent', (_req, res) => {
    res.send(RESPONSE);
  });

  app.post('/v1beta/models/:model\\:streamGenerateContent', (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.write(`data: ${JSON.stringify(RESPONSE)}\n\n`);
    res.end();
  });

  return new Promise(resolve => {
    const server = app.listen(0, () => {
      resolve(server);
    });
  });
}

async function run() {
  const server = await startMockServer();

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const client = new GoogleGenAI({
      apiKey: 'mock-api-key',
      httpOptions: { baseUrl: `http://localhost:${server.address().port}` },
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
