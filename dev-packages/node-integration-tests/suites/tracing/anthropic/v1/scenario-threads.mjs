import Anthropic from '@anthropic-ai/sdk';
import * as Sentry from '@sentry/node';
import express from 'express';

const MODEL = 'claude-3-haiku-20240307';

// The first turn calls the weather tool and the second answers. Ids are `msg_<mode>_<turn>`, so each span can be told apart.
function reply(mode, turn) {
  const id = `msg_${mode}_${turn}`;
  return turn === 'tools'
    ? {
        id,
        content: [{ type: 'tool_use', id: `toolu_${mode}`, name: 'weather', input: { city: 'Vienna' } }],
        stop_reason: 'tool_use',
        usage: { input_tokens: 10, output_tokens: 20 },
      }
    : {
        id,
        content: [{ type: 'text', text: 'Sunny.' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 30, output_tokens: 5 },
      };
}

function streamEvents({ id, content, stop_reason, usage }) {
  const events = [
    {
      type: 'message_start',
      message: {
        id,
        type: 'message',
        role: 'assistant',
        model: MODEL,
        content: [],
        usage: { input_tokens: usage.input_tokens },
      },
    },
  ];
  content.forEach((block, index) => {
    if (block.type === 'tool_use') {
      events.push(
        { type: 'content_block_start', index, content_block: { ...block, input: {} } },
        {
          type: 'content_block_delta',
          index,
          delta: { type: 'input_json_delta', partial_json: JSON.stringify(block.input) },
        },
      );
    } else {
      events.push(
        { type: 'content_block_start', index, content_block: { type: 'text', text: '' } },
        { type: 'content_block_delta', index, delta: { type: 'text_delta', text: block.text } },
      );
    }
    events.push({ type: 'content_block_stop', index });
  });
  events.push(
    {
      type: 'message_delta',
      delta: { stop_reason, stop_sequence: null },
      usage: { output_tokens: usage.output_tokens },
    },
    { type: 'message_stop' },
  );
  return events;
}

function startMockAnthropicServer() {
  const app = express();
  app.use(express.json());

  app.post('/anthropic/v1/messages', (req, res) => {
    const mode = req.headers['x-mode'];
    if (mode === 'thread_stream_error') {
      res.status(400).json({ type: 'error', error: { type: 'invalid_request_error', message: 'Bad thread' } });
      return;
    }
    const answersTool = req.body.messages.some(
      message => Array.isArray(message.content) && message.content.some(block => block.type === 'tool_result'),
    );
    const message = reply(mode, answersTool ? 'final' : 'tools');

    if (!req.body.stream) {
      res.json({ type: 'message', role: 'assistant', model: MODEL, stop_sequence: null, ...message });
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    // The body closes after the first text delta, without `message_stop`.
    const events = mode === 'thread_stream_truncated' ? streamEvents(message).slice(0, 3) : streamEvents(message);
    events.forEach((event, index) => {
      setTimeout(() => {
        res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
        if (index === events.length - 1) {
          res.end();
        }
      }, index * 5);
    });
  });

  return new Promise(resolve => {
    const server = app.listen(0, () => {
      resolve(server);
    });
  });
}

const tools = [
  {
    name: 'weather',
    description: 'Get the weather by city',
    input_schema: { type: 'object', properties: { city: { type: 'string' } } },
    run: () => 'sunny',
  },
];
const params = { model: MODEL, max_tokens: 100, messages: [{ role: 'user', content: 'Weather in Vienna?' }] };

const MODES = {
  async runner_stream_eager(client) {
    for await (const stream of client.beta.messages.toolRunner({
      ...params,
      tools,
      stream: true,
      runToolsEagerly: true,
    })) {
      await stream.finalMessage();
    }
  },
  async runner_stream(client) {
    for await (const stream of client.beta.messages.toolRunner({ ...params, tools, stream: true })) {
      await stream.finalMessage();
    }
  },
  // How Bedrock and Vertex clients, which have no threads, run every tool runner.
  async runner_stream_unthreaded(client) {
    for await (const stream of client.beta.messages.toolRunner({ ...params, tools, stream: true, thread: false })) {
      await stream.finalMessage();
    }
  },
  async runner(client) {
    for await (const _message of client.beta.messages.toolRunner({ ...params, tools })) {
      // consume
    }
  },
  async thread_send(client) {
    await client.beta.messages.thread({ model: MODEL, max_tokens: 100 }).send(params.messages);
  },
  async thread_stream(client) {
    await client.beta.messages.thread({ model: MODEL, max_tokens: 100 }).stream(params.messages).finalMessage();
  },
  async thread_stream_abort(client) {
    const stream = client.beta.messages.thread({ model: MODEL, max_tokens: 100 }).stream(params.messages);
    stream.once('streamEvent', () => stream.abort());
    await stream.finalMessage().catch(() => {});
  },
  async thread_stream_abort_early(client) {
    const stream = client.beta.messages.thread({ model: MODEL, max_tokens: 100 }).stream(params.messages);
    stream.abort();
    await stream.finalMessage().catch(() => {});
  },
  async thread_stream_truncated(client) {
    await client.beta.messages
      .thread({ model: MODEL, max_tokens: 100 })
      .stream(params.messages)
      .finalMessage()
      .catch(() => {});
  },
  async thread_stream_error(client) {
    await client.beta.messages
      .thread({ model: MODEL, max_tokens: 100 })
      .stream(params.messages)
      .finalMessage()
      .catch(() => {});
  },
};

async function run() {
  const server = await startMockAnthropicServer();
  const baseURL = `http://localhost:${server.address().port}/anthropic`;

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    for (const [mode, call] of Object.entries(MODES)) {
      await Sentry.startSpan({ name: mode }, () =>
        call(new Anthropic({ apiKey: 'mock-api-key', baseURL, maxRetries: 0, defaultHeaders: { 'x-mode': mode } })),
      );
    }
  });

  await Sentry.flush(2000);

  server.close();
}

run();
