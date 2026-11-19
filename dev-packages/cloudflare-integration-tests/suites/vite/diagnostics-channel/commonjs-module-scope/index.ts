import { tracingChannel } from 'node:diagnostics_channel';
import './emit.cjs';

const received: unknown[] = [];

// `emit.cjs` runs before this line, so no subscriber exists when it publishes its event.
tracingChannel('sentry-test:module-scope').end.subscribe(message => {
  received.push(message);
});

export default {
  fetch() {
    return Response.json({ received });
  },
} satisfies ExportedHandler;
