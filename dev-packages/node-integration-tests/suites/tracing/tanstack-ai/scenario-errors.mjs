import * as Sentry from '@sentry/node';
import { chat } from '@tanstack/ai';
import { fakeText } from '@tanstack/ai/testing';

const adapter = fakeText({ model: 'fake-model' });
adapter.setResponses([{ error: 'Model overloaded' }]);

const stopped = fakeText({ model: 'fake-model' });
stopped.setResponses([{ text: 'A long answer.' }]);

await Sentry.startSpan({ name: 'main' }, async () => {
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
