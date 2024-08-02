import { loggingTransport } from '@sentry-internal/node-integration-tests';
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
});

import { startFastifyServerAndSendPortToRunner } from '@sentry-internal/node-integration-tests';
import fastify from 'fastify';

const app = fastify();

app.get('/test/deprecated', (_req, res) => {
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  res.send({});
});

Sentry.setupFastifyErrorHandler(app);

startFastifyServerAndSendPortToRunner(app);
