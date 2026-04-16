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
  const server = await runServer(configPath, { listenArg: String(port) });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve());
  });
} catch (err) {
  console.error(err);
  process.exit(1);
}
