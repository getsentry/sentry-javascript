import { fork } from 'child_process';
import { join } from 'path';
import { loggingTransport, startExpressServerAndSendPortToRunner } from '@sentry-internal/node-integration-tests';
import { handleTunnelEnvelope } from '@sentry/core';
import * as Sentry from '@sentry/node';

const __dirname = new URL('.', import.meta.url).pathname;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  autoSessionTracking: false,
  transport: loggingTransport,
});

import express from 'express';

const app = express();

app.post('/tunnel', express.raw(), async (req, res) => {
  await handleTunnelEnvelope(req.body);
  res.sendStatus(200);
});

startExpressServerAndSendPortToRunner(app, undefined, port => {
  const child = fork(join(__dirname, 'child.mjs'), { stdio: 'inherit', env: { ...process.env, PORT: port.toString() } });
  child.on('exit', code => {
    console.log('Child process exited with code', code);
    process.exit(code);
  });
});
