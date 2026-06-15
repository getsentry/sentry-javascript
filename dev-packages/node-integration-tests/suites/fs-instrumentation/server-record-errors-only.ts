import * as Sentry from '@sentry/node';
import { loggingTransport, startExpressServerAndSendPortToRunner } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
  tracesSampleRate: 1,
  integrations: [
    // Only record error messages - file paths must NOT be recorded
    Sentry.fsIntegration({
      recordErrorMessagesAsSpanAttributes: true,
    }),
  ],
});

import express from 'express';
import * as fs from 'fs';
import * as path from 'path';

const app = express();

app.get('/readFile', async (_, res) => {
  await fs.promises.readFile(path.join(__dirname, 'fixtures', 'some-file.txt'), 'utf-8');
  res.send('done');
});

app.get('/readFile-error', async (_, res) => {
  try {
    await fs.promises.readFile(path.join(__dirname, 'fixtures', 'some-file-that-doesnt-exist.txt'), 'utf-8');
  } catch {
    // noop
  }
  res.send('done');
});

Sentry.setupExpressErrorHandler(app);

startExpressServerAndSendPortToRunner(app);
