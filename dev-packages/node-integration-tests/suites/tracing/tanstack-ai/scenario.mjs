import * as Sentry from '@sentry/node';
import { chat, toolDefinition } from '@tanstack/ai';
import { fakeText } from '@tanstack/ai/testing';

const getWeather = toolDefinition({
  name: 'get_weather',
  description: 'Get the current weather for a city.',
  inputSchema: { type: 'object', properties: { city: { type: 'string' } } },
}).server(async ({ city }) => ({ city, temperature: 21 }));

const streamed = fakeText({ model: 'fake-model' });
streamed.setResponses([
  { text: 'Let me check.', toolCalls: [{ id: 'call_1', name: 'get_weather', input: { city: 'Kyoto' } }] },
  { text: 'It is 21 degrees in Kyoto.' },
]);

const plain = fakeText({ model: 'fake-model' });
plain.setResponses([{ text: 'Hello!' }]);

const structured = fakeText({ model: 'fake-model' });
structured.setResponses([{ text: '{"city":"Kyoto"}' }]);

await Sentry.startSpan({ name: 'main' }, async () => {
  // The run starts only when the stream is read, here outside of the span that `chat()` was called in.
  const stream = Sentry.startSpan({ name: 'create-stream' }, () =>
    chat({
      adapter: streamed,
      threadId: 'thread-stream',
      systemPrompts: ['You are a weather assistant.'],
      messages: [{ role: 'user', content: 'What is the weather in Kyoto?' }],
      tools: [getWeather],
      modelOptions: { temperature: 0.5 },
    }),
  );
  for await (const _chunk of stream) {
    // drain
  }

  await chat({
    adapter: plain,
    threadId: 'thread-plain',
    messages: [{ role: 'user', content: 'Hi' }],
    stream: false,
  });

  await chat({
    adapter: structured,
    threadId: 'thread-structured',
    messages: [{ role: 'user', content: 'Which city?' }],
    outputSchema: { type: 'object', properties: { city: { type: 'string' } } },
  });
});
