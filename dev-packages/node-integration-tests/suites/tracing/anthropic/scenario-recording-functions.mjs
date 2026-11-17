import Anthropic from '@anthropic-ai/sdk';
import * as Sentry from '@sentry/node';
import express from 'express';

const MODEL = 'claude-3-haiku-20240307';

function message(id, content, stopReason = 'end_turn') {
  return {
    id,
    type: 'message',
    role: 'assistant',
    model: MODEL,
    content,
    stop_reason: stopReason,
    usage: { input_tokens: 10, output_tokens: 5 },
  };
}

function writeStream(res, id) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  const { content, ...start } = message(id, []);
  const events = [
    { type: 'message_start', message: { ...start, content } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Paris.' } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 5 } },
    { type: 'message_stop' },
  ];
  for (const event of events) {
    res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  }
  res.end();
}

function startMockServer() {
  const app = express();
  app.use(express.json());

  app.post('/anthropic/v1/messages', (req, res) => {
    const { metadata, stream, messages } = req.body;

    if (metadata.user_id === 'runner') {
      const answeredTools = messages.some(m => Array.isArray(m.content) && m.content[0]?.type === 'tool_result');
      res.send(
        answeredTools
          ? message('msg_tool_final', [{ type: 'text', text: 'Sunny in both.' }])
          : message(
              'msg_tool_use',
              [
                { type: 'tool_use', id: 'toolu_vienna', name: 'weather', input: { city: 'Vienna' } },
                { type: 'tool_use', id: 'toolu_paris', name: 'weather', input: { city: 'Paris' } },
              ],
              'tool_use',
            ),
      );
      return;
    }

    const id = `msg_${metadata.user_id}${stream ? '-stream' : ''}`;
    if (stream) {
      writeStream(res, id);
      return;
    }
    res.send(message(id, [{ type: 'text', text: 'Paris.' }]));
  });

  return new Promise(resolve => {
    const server = app.listen(0, () => {
      resolve(server);
    });
  });
}

async function run() {
  const server = await startMockServer();

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const client = new Anthropic({
      apiKey: 'mock-api-key',
      baseURL: `http://localhost:${server.address().port}/anthropic`,
    });
    const request = userId => ({
      model: MODEL,
      max_tokens: 100,
      messages: [{ role: 'user', content: 'What is the capital of France?' }],
      metadata: { user_id: userId },
    });

    await Sentry.withScope(async scope => {
      scope.setTag('privacy', 'public');
      await client.messages.create(request('public'));
    });

    await Sentry.withScope(async scope => {
      scope.setTag('privacy', 'private');
      await client.messages.create(request('private'));

      // Changing the tag after a call started must not change its outputs decision.
      const stream = await client.messages.create({ ...request('public'), stream: true });
      Sentry.getCurrentScope().setTag('privacy', 'public');
      for await (const event of stream) {
        void event;
      }

      Sentry.getCurrentScope().setTag('privacy', 'private');
      const helper = client.messages.stream(request('public-helper'));
      Sentry.getCurrentScope().setTag('privacy', 'public');
      await helper.finalMessage();
    });

    await Sentry.withScope(async scope => {
      scope.setTag('privacy', 'public');
      const runner = client.beta.messages.toolRunner({
        ...request('runner'),
        tools: [
          {
            name: 'weather',
            description: 'Get the weather by city',
            input_schema: { type: 'object', properties: { city: { type: 'string' } } },
            run: () => 'sunny',
          },
        ],
      });
      for await (const msg of runner) {
        void msg;
      }
    });
  });

  await Sentry.flush(2000);
  server.close();
}

run();
