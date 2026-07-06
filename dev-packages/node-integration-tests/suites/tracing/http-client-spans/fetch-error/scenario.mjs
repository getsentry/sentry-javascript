import { createServer } from 'http';
import * as Sentry from '@sentry/node';

// Bind and immediately release a port so we have an address that reliably refuses the connection.
// A refused outgoing request fires the `undici:request:error` channel, exercising the error path.
/**
 * @returns {Promise<number>}
 */
function getRefusedPort() {
  return new Promise(resolve => {
    const server = createServer();
    server.listen(0, () => {
      const address = /** @type {{ port: number }} */ (server.address());
      server.close(() => resolve(address.port));
    });
  });
}

async function run() {
  const port = await getRefusedPort();

  await Sentry.startSpan({ name: 'test_transaction' }, async () => {
    await fetch(`http://localhost:${port}/api/v0`).catch(() => {
      // Ignore the expected connection error
    });
  });
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
run();
