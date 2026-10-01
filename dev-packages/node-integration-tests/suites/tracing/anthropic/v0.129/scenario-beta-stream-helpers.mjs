import Anthropic from '@anthropic-ai/sdk';
import * as Sentry from '@sentry/node';
import express from 'express';

function startMockAnthropicServer() {
  const app = express();
  app.use(express.json());

  app.post('/anthropic/v1/messages', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    const model = req.body.model;
    // The response id names the caller, so the test can find the span for each helper.
    const id = `msg_${req.body.messages[0].content}`;
    const events = [
      {
        type: 'message_start',
        message: { id, type: 'message', role: 'assistant', model, content: [], usage: { input_tokens: 10 } },
      },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hello!' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 15 } },
      { type: 'message_stop' },
    ];
    events.forEach((event, index) => {
      setTimeout(() => {
        res.write(`event: ${event.type}\n`);
        res.write(`data: ${JSON.stringify(event)}\n\n`);
        if (index === events.length - 1) {
          res.end();
        }
      }, index * 10);
    });
  });

  return new Promise(resolve => {
    const server = app.listen(0, () => {
      resolve(server);
    });
  });
}

async function run() {
  const server = await startMockAnthropicServer();

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const client = new Anthropic({
      apiKey: 'mock-api-key',
      baseURL: `http://localhost:${server.address().port}/anthropic`,
    });

    await client.beta.messages
      .stream({
        model: 'claude-3-haiku-20240307',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'beta_stream' }],
      })
      .finalMessage();

    // With `runToolsEagerly`, the runner calls `beta.messages.create()` directly and not through
    // `beta.messages.stream()`, but it still sends the stream helper header.
    const runner = client.beta.messages.toolRunner({
      model: 'claude-3-haiku-20240307',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'tool_runner_eager' }],
      tools: [
        {
          name: 'weather',
          description: 'Get the weather by city',
          input_schema: { type: 'object', properties: { city: { type: 'string' } } },
          run: () => 'sunny',
        },
      ],
      stream: true,
      runToolsEagerly: true,
    });
    for await (const stream of runner) {
      await stream.finalMessage();
    }
  });

  await Sentry.flush(2000);

  server.close();
}

run();
