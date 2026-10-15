// `instrument.ts` is preloaded via `node --import`, so Sentry is already initialised here.
import * as Sentry from '@sentry/node';
import express from 'express';
import OpenAI from 'openai';

const apiKey = process.env.E2E_OPENROUTER_API_KEY;
if (!apiKey) {
  throw new Error('E2E_OPENROUTER_API_KEY is not set');
}

// OpenRouter serves the OpenAI API shape (chat completions, responses, embeddings), so the stock
// client only needs a different base URL. The model is incidental: what is under test is the SDK's own
// request/response code path, which is what Sentry instruments.
const client = new OpenAI({ apiKey, baseURL: 'https://openrouter.ai/api/v1' });

const CHAT_MODEL = 'openai/gpt-4o-mini';
const EMBEDDINGS_MODEL = 'openai/text-embedding-3-small';

const SHORT_ANSWER = 'Answer in at most five words.';
const CHAT_PROMPT = `What is the capital of France? ${SHORT_ANSWER}`;
// Deliberately does not name the tool: `tool_choice: 'required'` forces the call.
const WEATHER_PROMPT = `What is the weather in Paris? ${SHORT_ANSWER}`;
const SYSTEM = 'You are a helpful assistant used by an automated test.';

const WEATHER_TOOL = {
  type: 'function' as const,
  function: {
    name: 'get_weather',
    description: 'Get the current weather for a city.',
    parameters: {
      type: 'object',
      properties: { city: { type: 'string', description: 'The city name' } },
      required: ['city'],
    },
  },
};

const app = express();

/** The trace this request is recorded under, so the test can look its spans up in Sentry. */
function currentTraceId(): string | undefined {
  return Sentry.getActiveSpan()?.spanContext().traceId;
}

// Each route makes one call through the `openai` client and answers with the trace id, so the test can
// find the request's spans in Sentry.

app.get('/chat', async (_req, res, next) => {
  try {
    const completion = await client.chat.completions.create({
      model: CHAT_MODEL,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: CHAT_PROMPT },
      ],
      temperature: 0,
      max_tokens: 32,
    });
    res.send({
      traceId: currentTraceId(),
      answer: completion.choices[0]?.message.content ?? '',
    });
  } catch (error) {
    next(error);
  }
});

app.get('/chat-stream', async (_req, res, next) => {
  try {
    const stream = await client.chat.completions.create({
      model: CHAT_MODEL,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: CHAT_PROMPT },
      ],
      temperature: 0,
      max_tokens: 32,
      stream: true,
      // Ask for the usage in the final chunk, so the streamed span carries token counts.
      stream_options: { include_usage: true },
    });

    let answer = '';
    for await (const chunk of stream) {
      answer += chunk.choices[0]?.delta.content ?? '';
    }
    res.send({ traceId: currentTraceId(), answer });
  } catch (error) {
    next(error);
  }
});

app.get('/tools', async (_req, res, next) => {
  try {
    const completion = await client.chat.completions.create({
      model: CHAT_MODEL,
      messages: [{ role: 'user', content: WEATHER_PROMPT }],
      tools: [WEATHER_TOOL],
      tool_choice: 'required',
      max_tokens: 64,
    });
    res.send({
      traceId: currentTraceId(),
      toolCalls: completion.choices[0]?.message.tool_calls ?? [],
    });
  } catch (error) {
    next(error);
  }
});

app.get('/responses', async (_req, res, next) => {
  try {
    const response = await client.responses.create({
      model: CHAT_MODEL,
      instructions: SYSTEM,
      input: CHAT_PROMPT,
      temperature: 0,
      max_output_tokens: 32,
    });
    res.send({ traceId: currentTraceId(), answer: response.output_text });
  } catch (error) {
    next(error);
  }
});

app.get('/embeddings', async (_req, res, next) => {
  try {
    const embedding = await client.embeddings.create({
      model: EMBEDDINGS_MODEL,
      input: 'The capital of France is Paris.',
    });
    res.send({
      traceId: currentTraceId(),
      dimensions: embedding.data[0]?.embedding.length ?? 0,
    });
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
  console.log(`node-openai-send-to-sentry listening on port ${port}`);
});
