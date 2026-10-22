// `instrument.ts` is preloaded via `node --import`, so Sentry is already initialised here.
import * as Sentry from '@sentry/node';
import { FunctionCallingConfigMode, GoogleGenAI, Type } from '@google/genai';
import express from 'express';

const apiKey = process.env.E2E_OPENROUTER_API_KEY;
if (!apiKey) {
  throw new Error('E2E_OPENROUTER_API_KEY is not set');
}

// OpenRouter is the only model provider CI has a key for. The SDK sends Gemini's native
// `{model}:generateContent` requests, which OpenRouter does not serve, so every route answers 404
// until this app gets a Gemini API key and the default base URL.
const client = new GoogleGenAI({
  apiKey,
  httpOptions: { baseUrl: 'https://openrouter.ai/api', headers: { Authorization: `Bearer ${apiKey}` } },
});

const MODEL = 'google/gemini-2.5-flash-lite';
const EMBEDDING_MODEL = 'google/gemini-embedding-001';

const SHORT_ANSWER = 'Answer in at most five words.';
const CHAT_PROMPT = `What is the capital of France? ${SHORT_ANSWER}`;
// Deliberately does not name the tool: `FunctionCallingConfigMode.ANY` forces the call.
const WEATHER_PROMPT = `What is the weather in Paris? ${SHORT_ANSWER}`;
const SYSTEM = 'You are a helpful assistant used by an automated test.';

const GENERATION_CONFIG = { systemInstruction: SYSTEM, temperature: 0, maxOutputTokens: 32 };

const WEATHER_TOOL = {
  functionDeclarations: [
    {
      name: 'get_weather',
      description: 'Get the current weather for a city.',
      parameters: {
        type: Type.OBJECT,
        properties: { city: { type: Type.STRING, description: 'The city name' } },
        required: ['city'],
      },
    },
  ],
};

const app = express();

/** The trace this request is recorded under, so the test can look its spans up in Sentry. */
function currentTraceId(): string | undefined {
  return Sentry.getActiveSpan()?.spanContext().traceId;
}

// Each route makes one call through the `@google/genai` client and answers with the trace id, so
// the test can find the request's spans in Sentry.

app.get('/generate', async (_req, res, next) => {
  try {
    const response = await client.models.generateContent({
      model: MODEL,
      contents: CHAT_PROMPT,
      config: GENERATION_CONFIG,
    });
    res.send({ traceId: currentTraceId(), answer: response.text });
  } catch (error) {
    next(error);
  }
});

app.get('/generate-stream', async (_req, res, next) => {
  try {
    const stream = await client.models.generateContentStream({
      model: MODEL,
      contents: CHAT_PROMPT,
      config: GENERATION_CONFIG,
    });

    let answer = '';
    for await (const chunk of stream) {
      answer += chunk.text ?? '';
    }
    res.send({ traceId: currentTraceId(), answer });
  } catch (error) {
    next(error);
  }
});

// `chats.create()` takes the config once; each `sendMessage` reuses it and is recorded as a chat span.
app.get('/chat', async (_req, res, next) => {
  try {
    const chat = client.chats.create({ model: MODEL, config: GENERATION_CONFIG });
    const response = await chat.sendMessage({ message: CHAT_PROMPT });
    res.send({ traceId: currentTraceId(), answer: response.text });
  } catch (error) {
    next(error);
  }
});

app.get('/tools', async (_req, res, next) => {
  try {
    const response = await client.models.generateContent({
      model: MODEL,
      contents: WEATHER_PROMPT,
      config: {
        tools: [WEATHER_TOOL],
        toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.ANY } },
      },
    });
    res.send({ traceId: currentTraceId(), functionCalls: response.functionCalls });
  } catch (error) {
    next(error);
  }
});

app.get('/embeddings', async (_req, res, next) => {
  try {
    const response = await client.models.embedContent({ model: EMBEDDING_MODEL, contents: CHAT_PROMPT });
    res.send({ traceId: currentTraceId(), dimensions: response.embeddings?.[0]?.values?.length });
  } catch (error) {
    next(error);
  }
});

app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(500).send({ message: error.message });
});

const port = Number(process.env.PORT ?? 3030);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`node-google-genai-send-to-sentry listening on port ${port}`);
});
