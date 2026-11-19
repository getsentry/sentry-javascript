import { Mistral } from '@mistralai/mistralai';
import * as Sentry from '@sentry/node';
import express from 'express';
import {
  openAiChatCompletion,
  openAiChatCompletionChunks,
  startMockServer,
  streamSseEvents,
} from '@sentry-internal/node-integration-tests';

function startMockApi() {
  const app = express();
  app.use(express.json());

  app.post('/v1/agents/completions', (req, res) => {
    const { agent_id: agentId, stream } = req.body;

    if (agentId === 'error-agent') {
      res.status(404).set('x-request-id', 'mock-request-123').end('Agent not found');
      return;
    }

    if (stream) {
      const chunks = openAiChatCompletionChunks('mistral-large-latest', {
        id: 'agentcmpl-stream-123',
        content: 'Hello from Mistral agent streaming!',
      });
      streamSseEvents(res, chunks, { done: true });
    } else {
      res.send(
        openAiChatCompletion('mistral-large-latest', { id: 'agentcmpl-mock123', content: 'Hello from Mistral agent!' }),
      );
    }
  });

  return startMockServer(app);
}

async function run() {
  const server = await startMockApi();

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const client = new Mistral({
      apiKey: 'mock-api-key',
      serverURL: server.url,
    });

    await client.agents.complete({
      agentId: 'ag-mock-123',
      messages: [{ role: 'user', content: 'Who is the best French painter?' }],
    });

    const stream = await client.agents.stream({
      agentId: 'ag-mock-123',
      messages: [{ role: 'user', content: 'Tell me about streaming' }],
    });

    for await (const event of stream) {
      void event;
    }
  });

  await Sentry.flush(2000);
  server.close();
}

run();
