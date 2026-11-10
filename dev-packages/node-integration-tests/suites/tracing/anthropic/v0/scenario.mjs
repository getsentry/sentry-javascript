import Anthropic from '@anthropic-ai/sdk';
import * as Sentry from '@sentry/node';
import express from 'express';

function streamEvents(id, model) {
  return [
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
}

function startMockAnthropicServer() {
  const app = express();
  app.use(express.json());

  app.post('/anthropic/v1/messages', (req, res) => {
    // The prompt names the response id, so each call's span can be told apart.
    const id = req.body.messages[0].content;

    if (!req.body.stream) {
      res.json({
        id,
        type: 'message',
        role: 'assistant',
        model: req.body.model,
        content: [{ type: 'text', text: 'Hello!' }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 15 },
      });
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    const events = streamEvents(id, req.body.model);
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

  app.post('/anthropic/v1/complete', (req, res) => {
    res.json({
      id: req.body.prompt.includes('asResponse') ? 'compl_v0_as_response' : 'compl_v0',
      type: 'completion',
      model: req.body.model,
      completion: 'Hello!',
      stop_reason: 'stop_sequence',
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
    const model = 'claude-3-haiku-20240307';

    await client.messages.create({ model, max_tokens: 100, messages: [{ role: 'user', content: 'msg_v0_create' }] });
    await client.beta.messages.create({
      model,
      max_tokens: 100,
      messages: [{ role: 'user', content: 'msg_v0_beta_create' }],
    });

    const stream = await client.messages.create({
      model,
      max_tokens: 100,
      stream: true,
      messages: [{ role: 'user', content: 'msg_v0_stream' }],
    });
    for await (const _ of stream) {
      // consume
    }

    await client.messages
      .stream({ model, max_tokens: 100, messages: [{ role: 'user', content: 'msg_v0_stream_helper' }] })
      .finalMessage();

    await client.completions.create({
      model: 'claude-2',
      max_tokens_to_sample: 100,
      prompt: '\n\nHuman: Hello\n\nAssistant:',
    });
    const response = await client.completions
      .create({ model: 'claude-2', max_tokens_to_sample: 100, prompt: '\n\nHuman: asResponse\n\nAssistant:' })
      .asResponse();
    await response.json();
  });

  await Sentry.flush(2000);

  server.close();
}

run();
