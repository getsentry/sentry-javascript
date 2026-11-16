import * as Sentry from '@sentry/node';
import express from 'express';
import OpenAI from 'openai';

function startMockServer() {
  const app = express();
  app.use(express.json());

  // Never responds, so each request only ends when the client gives up on it.
  app.post('/openai/chat/completions', () => {});

  return new Promise(resolve => {
    const server = app.listen(0, () => {
      resolve(server);
    });
  });
}

function abortAfter(ms) {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

async function run() {
  const server = await startMockServer();

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const client = new OpenAI({
      baseURL: `http://localhost:${server.address().port}/openai`,
      apiKey: 'mock-api-key',
      maxRetries: 0,
    });
    const messages = [{ role: 'user', content: 'Aborted by the caller' }];

    const requests = [
      [{ model: 'abort-before-stream', stream: true }, { signal: abortAfter(50) }],
      [{ model: 'abort-non-streaming' }, { signal: abortAfter(50) }],
      [{ model: 'timeout-before-stream', stream: true }, { timeout: 50 }],
      [{ model: 'timeout-non-streaming' }, { timeout: 50 }],
    ];
    for (const [params, requestOptions] of requests) {
      try {
        await client.chat.completions.create({ ...params, messages }, requestOptions);
      } catch {
        // Error expected
      }
    }
  });

  await Sentry.flush(2000);

  server.closeAllConnections();
  server.close();
}

run();
