import Anthropic from '@anthropic-ai/sdk';
import * as Sentry from '@sentry/node';
import express from 'express';
import {
  anthropicMessage,
  anthropicMessageStream,
  startMockServer,
  streamSseEvents,
} from '@sentry-internal/node-integration-tests';

const MODEL = 'claude-3-haiku-20240307';

// The first turn calls the weather tool and the second answers. Ids are `msg_<mode>_<turn>`, so each span can be told apart.
function reply(mode, turn) {
  const id = `msg_${mode}_${turn}`;
  return turn === 'tools'
    ? {
        id,
        content: [{ type: 'tool_use', id: `toolu_${mode}`, name: 'weather', input: { city: 'Vienna' } }],
        usage: { input_tokens: 10, output_tokens: 20 },
      }
    : { id, content: 'Sunny.', usage: { input_tokens: 30, output_tokens: 5 } };
}

let recoveredReplies = 0;

function startMockAnthropicServer() {
  const app = express();
  app.use(express.json());

  app.post('/anthropic/v1/messages', (req, res) => {
    const mode = req.headers['x-mode'];
    // Never responds, so the request only ends when the caller's signal fires.
    if (mode === 'thread_stream_signal_abort' || mode === 'thread_stream_signal_timeout') {
      return;
    }
    if (mode === 'thread_stream_error') {
      res.status(400).json({ type: 'error', error: { type: 'invalid_request_error', message: 'Bad thread' } });
      return;
    }
    const answersTool = req.body.messages.some(
      message => Array.isArray(message.content) && message.content.some(block => block.type === 'tool_result'),
    );
    // The server lost the thread, so the SDK replays the turn that continues it.
    if (mode === 'thread_stream_recovered' && req.body.thread?.type === 'continue') {
      res.status(404).json({
        type: 'error',
        error: { type: 'not_found_error', message: 'Thread not found', details: { error_code: 'thread_not_found' } },
      });
      return;
    }
    if (mode === 'thread_stream_failed_signal_reuse' && !answersTool) {
      res.status(400).json({ type: 'error', error: { type: 'invalid_request_error', message: 'Bad thread' } });
      return;
    }
    const message =
      mode === 'thread_stream_recovered'
        ? { ...reply(mode, 'final'), id: `msg_${mode}_${(recoveredReplies += 1)}` }
        : reply(mode, answersTool ? 'final' : 'tools');

    if (!req.body.stream) {
      res.json(anthropicMessage(MODEL, message));
      return;
    }

    const events = anthropicMessageStream(MODEL, message);
    // The body closes after the first tool input delta, without `message_stop`.
    streamSseEvents(res, mode === 'thread_stream_truncated' ? events.slice(0, 3) : events, { eventNames: true });
  });

  return startMockServer(app);
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

async function streamFollowUp(client, signal) {
  const answer = { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'sunny' }] };
  const followUp = await client.beta.messages.create(
    { ...params, messages: [...params.messages, answer], stream: true },
    { signal },
  );
  for await (const _event of followUp) {
    // consume
  }
}

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
  // A later request sent with a finished thread stream's signal is not that stream's request.
  async thread_stream_signal_reuse(client) {
    const stream = client.beta.messages.thread({ model: MODEL, max_tokens: 100 }).stream(params.messages);
    await stream.finalMessage();
    await streamFollowUp(client, stream.controller.signal);
  },
  async thread_stream_failed_signal_reuse(client) {
    const stream = client.beta.messages.thread({ model: MODEL, max_tokens: 100 }).stream(params.messages);
    await stream.finalMessage().catch(() => {});
    await streamFollowUp(client, stream.controller.signal);
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
  async thread_stream_signal_abort(client) {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 50);
    await client.beta.messages
      .thread({ model: MODEL, max_tokens: 100 })
      .stream(params.messages, {}, { signal: controller.signal })
      .finalMessage()
      .catch(() => {});
  },
  async thread_stream_signal_timeout(client) {
    await client.beta.messages
      .thread({ model: MODEL, max_tokens: 100 })
      .stream(params.messages, {}, { signal: AbortSignal.timeout(50) })
      .finalMessage()
      .catch(() => {});
  },
  async thread_stream_truncated(client) {
    await client.beta.messages
      .thread({ model: MODEL, max_tokens: 100 })
      .stream(params.messages)
      .finalMessage()
      .catch(() => {});
  },
  async thread_stream_recovered(client) {
    const thread = client.beta.messages.thread({ model: MODEL, max_tokens: 100 });
    await thread.stream(params.messages).finalMessage();
    await thread.stream([{ role: 'user', content: 'And tomorrow?' }]).finalMessage();
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
  const baseURL = `${server.url}/anthropic`;

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
