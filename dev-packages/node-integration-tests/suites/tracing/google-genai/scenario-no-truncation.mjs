import { GoogleGenAI } from '@google/genai';
import * as Sentry from '@sentry/node';
import express from 'express';

function startMockGoogleGenAIServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  app.post('/v1beta/models/:model\\:generateContent', (req, res) => {
    res.send({
      candidates: [
        {
          content: { parts: [{ text: 'Response' }], role: 'model' },
          finishReason: 'stop',
          index: 0,
        },
      ],
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

    // Long content that would normally be truncated
    const longContent = 'A'.repeat(50_000);
    await client.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: [
        { role: 'user', parts: [{ text: longContent }] },
        { role: 'model', parts: [{ text: 'Some reply' }] },
        { role: 'user', parts: [{ text: 'Follow-up question' }] },
      ],
    });
  });

  await Sentry.flush(2000);

  server.close();
}

run();
