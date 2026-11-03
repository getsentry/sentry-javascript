import { sendPortToRunner } from '@sentry-internal/node-integration-tests';
import { H3, serve } from 'h3';
import { tracingPlugin as h3TracingPlugin } from 'h3/tracing';
import { tracingPlugin as srvxTracingPlugin } from 'srvx/tracing';
import { createStorage } from 'unstorage';
import { withTracing } from 'unstorage/tracing';

// Enables the same diagnostics channels a Nitro app publishes, without a Nitro build.
const storage = withTracing(createStorage());

const app = new H3({ plugins: [h3TracingPlugin()] });

app.get('/hello/:name', event => `Hello, ${event.context.params.name}!`);

app.get('/cache', async () => {
  await storage.setItem('cache:key', 'value');
  return storage.getItem('cache:key');
});

const server = serve(app, { port: 0, silent: true, plugins: [srvxTracingPlugin()] });

await server.ready();
sendPortToRunner(new URL(server.url).port);
