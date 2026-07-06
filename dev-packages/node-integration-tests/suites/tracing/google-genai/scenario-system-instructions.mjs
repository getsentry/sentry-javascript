import { GoogleGenAI } from '@google/genai';
import * as Sentry from '@sentry/node';
import express from 'express';

function startMockGoogleGenAIServer() {
  const app = express();
  app.use(express.json());

  app.post('/v1beta/models/:model\\:generateContent', (req, res) => {
    res.send({
      candidates: [
        {
          content: { parts: [{ text: 'Response' }], role: 'model' },
          finishReason: 'stop',
          index: 0,
        },
      ],
      modelVersion: req.params.model,
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
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

    await client.models.generateContent({
      model: 'gemini-1.5-flash',
      config: {
        systemInstruction: 'You are a helpful assistant',
      },
      contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
    });
  });

  await Sentry.flush(2000);

  server.close();
}

run();
