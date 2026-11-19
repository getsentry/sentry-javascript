// The code that the Sentry Vite plugin injects into a CommonJS package (for example `express`), reduced to one event.
const { tracingChannel } = require('@sentry/cloudflare/orchestrion-diagnostics-channel');

const channel = tracingChannel('sentry-test:module-scope');
const context = { arguments: ['from a CommonJS module'] };

channel.start.runStores(context, () => {
  channel.end.publish(context);
});
