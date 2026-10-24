import * as Sentry from '@sentry/node';
import { chat, toolDefinition } from '@tanstack/ai';
import { fakeText } from '@tanstack/ai/testing';

// `MIDDLEWARE=manual` passes the middleware explicitly; otherwise the call carries none and relies
// on the integration injecting it.
const middleware = process.env.MIDDLEWARE === 'manual' ? [Sentry.createTanstackAiMiddleware()] : undefined;

const getWeather = toolDefinition({
  name: 'get_weather',
  description: 'Get the current weather for a city.',
  inputSchema: { type: 'object', properties: { city: { type: 'string' } } },
}).server(async ({ city }) => Sentry.startSpan({ name: 'weather-lookup' }, () => ({ city, temperature: 21 })));

// The fake estimates prompt caching per thread, so the second model call reports cached tokens.
const adapter = fakeText({ model: 'fake-model', cache: true });
adapter.setResponses([
  { text: 'Let me check.', toolCalls: [{ name: 'get_weather', input: { city: 'Vienna' } }] },
  { text: 'It is 21 degrees in Vienna.' },
]);

const options = {
  adapter,
  threadId: 'thread-1',
  systemPrompts: ['You are a helpful assistant.'],
  messages: [{ role: 'user', content: 'What is the weather in Vienna?' }],
  tools: [getWeather],
  middleware,
};

await Sentry.startSpan({ name: 'main' }, async () => {
  if (process.env.STREAM) {
    // The run only advances while the consumer pulls chunks, as when streaming to a response.
    for await (const _chunk of chat({ ...options, stream: true })) {
      // drain
    }
  } else {
    await chat({ ...options, stream: false });
  }
});
