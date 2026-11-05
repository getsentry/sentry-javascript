import { GoogleGenAI } from '@google/genai';
import * as Sentry from '@sentry/node';
import express from 'express';

function startMockGoogleGenAIServer() {
  const app = express();
  app.use(express.json());

  app.post('/v1beta/models/:model\\:streamGenerateContent', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Transfer-Encoding', 'chunked');

    const chunks = [
      {
        candidates: [{ content: { parts: [{ text: 'This stream will ' }], role: 'model' }, index: 0 }],
        responseId: 'mock-midway-response-id',
        modelVersion: 'gemini-1.5-pro',
        usageMetadata: { promptTokenCount: 8, candidatesTokenCount: 4, totalTokenCount: 12 },
      },
      { candidates: [{ content: { parts: [{ text: 'be cut off' }], role: 'model' }, index: 0 }] },
    ];
    chunks.forEach((chunk, index) => {
      setTimeout(() => res.write(`data: ${JSON.stringify(chunk)}\n\n`), index * 10);
    });

    // The midway case drops the connection after the chunks are parsed, without a final chunk.
    // The other cases need the body to stay open long enough for their abort to hit a pending read.
    setTimeout(
      () => (req.params.model === 'midway-error' ? res.destroy() : res.end()),
      req.params.model === 'midway-error' ? 70 : 1000,
    );
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

    try {
      const stream = await client.models.generateContentStream({
        model: 'midway-error',
        contents: [{ role: 'user', parts: [{ text: 'This will fail midway' }] }],
      });
      for await (const _ of stream) {
        void _;
      }
    } catch {
      // Error expected
    }

    const stream = await client.models.generateContentStream({
      model: 'early-break',
      contents: [{ role: 'user', parts: [{ text: 'The caller stops reading after the first chunk' }] }],
    });
    for await (const _ of stream) {
      break;
    }

    const controller = new AbortController();
    try {
      const abortedStream = await client.models.generateContentStream({
        model: 'caller-abort',
        contents: [{ role: 'user', parts: [{ text: 'The caller aborts after the first chunk' }] }],
        config: { abortSignal: controller.signal },
      });
      for await (const _ of abortedStream) {
        controller.abort();
      }
    } catch {
      // Error expected
    }

    try {
      const timedOutStream = await client.models.generateContentStream({
        model: 'timeout',
        contents: [{ role: 'user', parts: [{ text: 'The SDK timeout fires mid-stream' }] }],
        config: { httpOptions: { timeout: 100 } },
      });
      for await (const _ of timedOutStream) {
        void _;
      }
    } catch {
      // Error expected
    }
  });

  await Sentry.flush(2000);

  server.close();
}

run();
