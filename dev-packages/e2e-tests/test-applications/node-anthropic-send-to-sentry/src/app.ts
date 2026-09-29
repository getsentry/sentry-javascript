// `instrument.ts` is preloaded via `node --import`, so Sentry is already initialised here.
import * as Sentry from '@sentry/node';
import Anthropic from '@anthropic-ai/sdk';
import express from 'express';

const apiKey = process.env.E2E_OPENROUTER_API_KEY;
if (!apiKey) {
  throw new Error('E2E_OPENROUTER_API_KEY is not set');
}

// OpenRouter serves an Anthropic-compatible `/api/v1/messages`, so the stock client only needs a
// different base URL. It authenticates with a bearer token, so the key goes in `authToken`
// (Authorization: Bearer) rather than `apiKey` (x-api-key). The model is incidental: what is under
// test is the SDK's own request/response code path, which is what Sentry instruments.
const client = new Anthropic({ authToken: apiKey, baseURL: 'https://openrouter.ai/api' });

const MODEL = 'openai/gpt-4o-mini';

const SHORT_ANSWER = 'Answer in at most five words.';
const CHAT_PROMPT = `What is the capital of France? ${SHORT_ANSWER}`;
// Deliberately does not name the tool: `tool_choice` forces the call.
const WEATHER_PROMPT = `What is the weather in Paris? ${SHORT_ANSWER}`;
const SYSTEM = 'You are a helpful assistant used by an automated test.';

const WEATHER_TOOL = {
  name: 'get_weather',
  description: 'Get the current weather for a city.',
  input_schema: {
    type: 'object' as const,
    properties: { city: { type: 'string', description: 'The city name' } },
    required: ['city'],
  },
};

const app = express();

/** The trace this request is recorded under, so the test can look its spans up in Sentry. */
function currentTraceId(): string | undefined {
  return Sentry.getActiveSpan()?.spanContext().traceId;
}

/** The text of a message's first text block. */
function textOf(message: Anthropic.Message): string {
  const first = message.content[0];
  return first?.type === 'text' ? first.text : '';
}

// Each route makes one call through the `@anthropic-ai/sdk` client and answers with the trace id, so
// the test can find the request's spans in Sentry.

app.get('/chat', async (_req, res, next) => {
  try {
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 32,
      temperature: 0,
      system: SYSTEM,
      messages: [{ role: 'user', content: CHAT_PROMPT }],
    });
    res.send({ traceId: currentTraceId(), answer: textOf(message) });
  } catch (error) {
    next(error);
  }
});

// `messages.create({ stream: true })` returns an async iterable of events the caller drains.
app.get('/chat-stream', async (_req, res, next) => {
  try {
    const stream = await client.messages.create({
      model: MODEL,
      max_tokens: 32,
      temperature: 0,
      system: SYSTEM,
      messages: [{ role: 'user', content: CHAT_PROMPT }],
      stream: true,
    });

    let answer = '';
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        answer += event.delta.text;
      }
    }
    res.send({ traceId: currentTraceId(), answer });
  } catch (error) {
    next(error);
  }
});

// `messages.stream()` is the SDK's streaming helper: it accumulates the events into the final
// message, and the integration instruments it separately from `create`.
app.get('/stream-helper', async (_req, res, next) => {
  try {
    const message = await client.messages
      .stream({
        model: MODEL,
        max_tokens: 32,
        temperature: 0,
        system: SYSTEM,
        messages: [{ role: 'user', content: CHAT_PROMPT }],
      })
      .finalMessage();
    res.send({ traceId: currentTraceId(), answer: textOf(message) });
  } catch (error) {
    next(error);
  }
});

app.get('/tools', async (_req, res, next) => {
  try {
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 64,
      messages: [{ role: 'user', content: WEATHER_PROMPT }],
      tools: [WEATHER_TOOL],
      tool_choice: { type: 'tool', name: 'get_weather' },
    });
    res.send({ traceId: currentTraceId(), toolUse: message.content.filter(block => block.type === 'tool_use') });
  } catch (error) {
    next(error);
  }
});

Sentry.setupExpressErrorHandler(app);

app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(500).send({ message: error.message });
});

const port = Number(process.env.PORT ?? 3030);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`node-anthropic-send-to-sentry listening on port ${port}`);
});
