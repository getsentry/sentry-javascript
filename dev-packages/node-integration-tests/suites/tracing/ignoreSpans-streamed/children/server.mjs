import express from 'express';
import cors from 'cors';
import * as Sentry from '@sentry/node';
import { startExpressServerAndSendPortToRunner } from '@sentry-internal/node-integration-tests';

const app = express();

app.use(cors());

app.get('/test/express', (_req, res) => {
  Sentry.startSpan(
    {
      name: 'custom-to-drop',
      op: 'custom',
    },
    () => {
      Sentry.startSpan(
        {
          name: 'custom',
          op: 'custom',
        },
        () => {},
      );
    },
  );
  res.send({ response: 'response 1' });
});

Sentry.setupExpressErrorHandler(app);

startExpressServerAndSendPortToRunner(app);
