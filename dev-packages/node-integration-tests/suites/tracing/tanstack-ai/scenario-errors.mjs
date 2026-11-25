import * as Sentry from '@sentry/node';
import { chat } from '@tanstack/ai';
import { fakeText } from '@tanstack/ai/testing';

const adapter = fakeText({ model: 'fake-model' });
adapter.setResponses([{ error: 'Model overloaded' }]);

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
});
