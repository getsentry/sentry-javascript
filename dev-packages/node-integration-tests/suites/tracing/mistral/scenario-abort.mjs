import { Mistral } from '@mistralai/mistralai';
import * as Sentry from '@sentry/node';
import express from 'express';
import { startMockServer } from '@sentry-internal/node-integration-tests';

function startMockApi() {
  const app = express();
  app.use(express.json());

  // Never responds, so each request only ends when the client gives up on it.
  app.post('/v1/chat/completions', () => {});

  return startMockServer(app);
}

function abortAfter(ms) {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

async function run() {
  const server = await startMockApi();

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const client = new Mistral({
      apiKey: 'mock-api-key',
      serverURL: server.url,
      retryConfig: { strategy: 'none' },
    });
    const messages = [{ role: 'user', content: 'Aborted by the caller' }];

    const requests = [
      ['stream', 'abort-before-stream', () => ({ signal: abortAfter(50) })],
      ['complete', 'abort-non-streaming', () => ({ fetchOptions: { signal: abortAfter(50) } })],
      ['stream', 'timeout-before-stream', () => ({ timeoutMs: 50 })],
      ['complete', 'timeout-non-streaming', () => ({ timeoutMs: 50 })],
    ];
    for (const [method, model, requestOptions] of requests) {
      try {
        await client.chat[method]({ model, messages }, requestOptions());
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
