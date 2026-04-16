/* eslint-disable no-console */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { runServer } = require('verdaccio');

const configPath = process.argv[2];
const port = parseInt(process.argv[3], 10);

if (!configPath || !Number.isFinite(port)) {
  console.error('verdaccio-runner: expected <configPath> <port> argv');
  process.exit(1);
}

try {
  // runServer resolves to the Express app; binding errors are emitted on the
  // http.Server returned by app.listen(), not on the app itself.
  const app = await runServer(configPath, { listenArg: String(port) });
  await new Promise((resolve, reject) => {
    const httpServer = app.listen(port, '127.0.0.1', () => resolve());
    httpServer.once('error', reject);
  });
} catch (err) {
  console.error(err);
  process.exit(1);
}
