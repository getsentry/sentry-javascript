import { createServer } from 'http';
import { loggingTransport } from '@sentry-internal/node-integration-tests';
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
});

// Bind and immediately release a port so we have an address that reliably refuses the connection.
// A refused outgoing request fires the `undici:request:error` channel, exercising the error path.
function getRefusedPort(): Promise<number> {
  return new Promise(resolve => {
    const server = createServer();
    server.listen(0, () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });
}

async function run(): Promise<void> {
  const port = await getRefusedPort();

  await Sentry.startSpan({ name: 'test_transaction' }, async () => {
    await fetch(`http://localhost:${port}/api/v0`).catch(() => {
      // Ignore the expected connection error
    });
  });
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
run();
