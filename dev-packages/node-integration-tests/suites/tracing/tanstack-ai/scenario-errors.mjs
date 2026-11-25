import * as Sentry from '@sentry/node';
import { chat, toolDefinition } from '@tanstack/ai';
import { fakeText } from '@tanstack/ai/testing';

const getWeather = toolDefinition({
  name: 'get_weather',
  description: 'Get the current weather for a city.',
  inputSchema: { type: 'object', properties: { city: { type: 'string' } } },
}).server(async () => {
  throw new Error('Weather service down');
});

const adapter = fakeText({ model: 'fake-model' });
adapter.setResponses([
  { toolCalls: [{ id: 'call_1', name: 'get_weather', input: { city: 'Kyoto' } }] },
  { text: 'I could not get the weather.' },
  { error: 'Model overloaded' },
]);

const stopped = fakeText({ model: 'fake-model' });
stopped.setResponses([{ text: 'A long answer.' }]);

await Sentry.startSpan({ name: 'main' }, async () => {
  await chat({
    adapter,
    threadId: 'thread-tool-error',
    messages: [{ role: 'user', content: 'What is the weather in Kyoto?' }],
    tools: [getWeather],
    stream: false,
  });

  try {
    await chat({
      adapter,
      threadId: 'thread-model-error',
      messages: [{ role: 'user', content: 'Hi' }],
      stream: false,
    });
  } catch {
    // expected
  }

  // The app stops reading before the run completes and does not abort it.
  for await (const chunk of chat({
    adapter: stopped,
    threadId: 'thread-stopped',
    messages: [{ role: 'user', content: 'Hi' }],
  })) {
    if (chunk.type === 'TEXT_MESSAGE_CONTENT') {
      break;
    }
  }
});
