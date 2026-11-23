import Anthropic from '@anthropic-ai/sdk';
import * as Sentry from '@sentry/node';
import express from 'express';
import { anthropicMessageStream, startMockServer } from '@sentry-internal/node-integration-tests';

function startMockAnthropicServer() {
  const app = express();
  app.use(express.json());

  app.post('/anthropic/v1/messages', (req, res) => {
    // Never respond, so the caller aborts before the response arrives.
    if (req.body.model === 'abort-before-response') {
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    // Send `message_start` and the first text delta, then keep the connection open, so the caller aborts mid-stream.
    const events = anthropicMessageStream(req.body.model, {
      id: 'msg_abort_midway_1',
      content: 'This stream will ',
      usage: { input_tokens: 5, output_tokens: 0 },
    }).slice(0, 3);
    for (const event of events) {
      res.write(`event: ${event.type}\n`);
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  });

  return startMockServer(app);
}

async function run() {
  const server = await startMockAnthropicServer();

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const client = new Anthropic({
      apiKey: 'mock-api-key',
      baseURL: `${server.url}/anthropic`,
    });

    // 1) Abort before the response arrives
    const beforeResponse = client.messages.stream({
      model: 'abort-before-response',
      messages: [{ role: 'user', content: 'This will be aborted before the response' }],
    });
    setTimeout(() => beforeResponse.abort(), 50);
    try {
      await beforeResponse.done();
    } catch {
      // Abort expected
    }

    // 2) Abort midway through streaming
    const midway = client.messages.stream({
      model: 'abort-midway',
      messages: [{ role: 'user', content: 'This will be aborted midway' }],
    });
    midway.on('text', () => midway.abort());
    try {
      await midway.done();
    } catch {
      // Abort expected
    }
  });

  await Sentry.flush(2000);

  server.closeAllConnections();
  server.close();
}

run();
