import { loggingTransport, startExpressServerAndSendPortToRunner } from '@sentry-internal/node-integration-tests';
import * as Sentry from '@sentry/node-experimental';
import cors from 'cors';
import express from 'express';

const app = express();

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  integrations: [Sentry.httpIntegration({ tracing: true }), new Sentry.Integrations.Express({ app })],
  tracesSampleRate: 1.0,
  transport: loggingTransport,
});

app.use(Sentry.Handlers.requestHandler());
app.use(Sentry.Handlers.tracingHandler());

app.use(cors());

const APIv1 = express.Router();

APIv1.get('/test', function (_req, res) {
  Sentry.captureMessage('Custom Message');
  res.send('Success');
});

const root = express.Router();

app.use('/api/v1', root);
app.use('/api2/v1', APIv1);

app.use(Sentry.Handlers.errorHandler());

startExpressServerAndSendPortToRunner(app);
