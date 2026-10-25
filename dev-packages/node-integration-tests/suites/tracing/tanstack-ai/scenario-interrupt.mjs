import * as Sentry from '@sentry/node';
import { chat, defineInterrupt } from '@tanstack/ai';
import { fakeText } from '@tanstack/ai/testing';

// A middleware pauses the run at the interrupt boundary that `INTERRUPT` names: `beforeModel` or `afterModel`.
const confirm = defineInterrupt({ id: 'confirm' });
const pauseRun = {
  name: 'confirm',
  onInterruptBoundary: ctx =>
    ctx.phase === process.env.INTERRUPT
      ? { interrupts: [confirm.interrupt({ key: 'confirm-1', reason: 'review', message: 'Please confirm.' })] }
      : undefined,
};

const adapter = fakeText({ model: 'fake-model' });
adapter.setResponses([{ text: 'It is 21 degrees in Vienna.' }]);

await Sentry.startSpan({ name: 'main' }, async () => {
  for await (const _chunk of chat({
    adapter,
    threadId: 'thread-1',
    messages: [{ role: 'user', content: 'What is the weather in Vienna?' }],
    interrupts: [confirm],
    middleware: [pauseRun],
  })) {
    // drain
  }
});
