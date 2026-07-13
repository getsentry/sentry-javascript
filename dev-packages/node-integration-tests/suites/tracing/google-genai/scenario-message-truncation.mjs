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
          content: { parts: [{ text: 'Response to truncated messages' }], role: 'model' },
          finishReason: 'stop',
          index: 0,
        },
      ],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 15, totalTokenCount: 25 },
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

    // Test 1: Given an array of messages only the last message should be kept
    // The last message should be truncated to fit within the 20KB limit
    const largeContent1 = 'A'.repeat(15000); // ~15KB
    const largeContent2 = 'B'.repeat(15000); // ~15KB
    const largeContent3 = 'C'.repeat(25000) + 'D'.repeat(25000); // ~50KB (will be truncated, only C's remain)

    await client.models.generateContent({
      model: 'gemini-1.5-flash',
      config: {
        temperature: 0.7,
        topP: 0.9,
        maxOutputTokens: 100,
      },
      contents: [
        { role: 'user', parts: [{ text: largeContent1 }] },
        { role: 'model', parts: [{ text: largeContent2 }] },
        { role: 'user', parts: [{ text: largeContent3 }] },
      ],
    });

    // Test 2: Given an array of messages only the last message should be kept
    // The last message is small, so it should be kept intact
    const smallContent = 'This is a small message that fits within the limit';
    await client.models.generateContent({
      model: 'gemini-1.5-flash',
      config: {
        temperature: 0.7,
        topP: 0.9,
        maxOutputTokens: 100,
      },
      contents: [
        { role: 'user', parts: [{ text: largeContent1 }] },
        { role: 'model', parts: [{ text: largeContent2 }] },
        { role: 'user', parts: [{ text: smallContent }] },
      ],
    });
  });

  await Sentry.flush(2000);

  server.close();
}

run();
