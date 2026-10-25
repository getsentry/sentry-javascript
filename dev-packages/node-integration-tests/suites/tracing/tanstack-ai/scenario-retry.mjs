import * as Sentry from '@sentry/node';
import { chat } from '@tanstack/ai';
import { fakeText } from '@tanstack/ai/testing';

// A middleware calls the model again after the first call fails.
const retry = { name: 'retry', onModelError: ctx => ctx.retry() };

const adapter = fakeText({ model: 'fake-model' });
adapter.setResponses([{ error: 'Overloaded' }, { text: 'It is 21 degrees in Vienna.' }]);

await Sentry.startSpan({ name: 'main' }, async () => {
  await chat({
    adapter,
    threadId: 'thread-1',
    messages: [{ role: 'user', content: 'What is the weather in Vienna?' }],
    middleware: [retry],
    stream: false,
  });
});
