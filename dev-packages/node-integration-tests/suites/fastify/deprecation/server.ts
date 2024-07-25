import { loggingTransport } from '@sentry-internal/node-integration-tests';
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
});

import { startFastifyServerAndSendPortToRunner } from '@sentry-internal/node-integration-tests';
import Fastify from 'fastify';

const app = Fastify();

app.get('/test/deprecated', (_req, res) => {
  res.send({});
});

Sentry.setupFastifyErrorHandler(app);

startFastifyServerAndSendPortToRunner(app);
