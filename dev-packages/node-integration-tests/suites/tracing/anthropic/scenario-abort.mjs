import Anthropic from '@anthropic-ai/sdk';
import * as Sentry from '@sentry/node';
import express from 'express';

function startMockAnthropicServer() {
  const app = express();
  app.use(express.json());

  // Never responds, so each request only ends when the client gives up on it.
  app.post('/anthropic/v1/messages', () => {});

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
  const server = await startMockAnthropicServer();

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const client = new Anthropic({
      apiKey: 'mock-api-key',
      baseURL: `http://localhost:${server.address().port}/anthropic`,
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
        await client.messages.create({ ...params, max_tokens: 100, messages }, requestOptions);
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
