import { loggingTransport, startExpressServerAndSendPortToRunner } from '@sentry-internal/node-integration-tests';
import * as Sentry from '@sentry/node';
import express from 'express';

const app = express();

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  // eslint-disable-next-line deprecation/deprecation
  integrations: [Sentry.httpIntegration({ tracing: true }), new Sentry.Integrations.Express({ app })],
  tracesSampleRate: 1.0,
  transport: loggingTransport,
});

app.use(Sentry.Handlers.requestHandler());
app.use(Sentry.Handlers.tracingHandler());

const APIv1 = express.Router();

APIv1.use(
  '/users/:userId',
  APIv1.get('/posts/:postId', (_req, res) => {
    Sentry.captureMessage('Custom Message');
    return res.send('Success');
  }),
);

const root = express.Router();

app.use('/api/v1', APIv1);
app.use('/api', root);

app.use(Sentry.Handlers.errorHandler());

startExpressServerAndSendPortToRunner(app);
