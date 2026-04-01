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
        () => {
          Sentry.startSpan({ name: 'custom-grandchild', op: 'custom' }, () => {
            Sentry.startSpan({ name: 'custom-to-drop-grand-grandchild', op: 'custom' }, () => {
              Sentry.startSpan({ name: 'custom-grand-grand-grandchild', op: 'custom' }, () => {});
            });
          });
          Sentry.startSpan({ name: 'custom-grandchild-2', op: 'custom' }, () => {});
        },
      );
    },
  );

  Sentry.startSpan({ name: 'name-passes-but-op-not-span-1', op: 'ignored-op' }, () => {}),
  Sentry.startSpan(
    // sentry.op attribute has precedence over top op argument
    { name: 'name-passes-but-op-not-span-2', /*op: 'keep',*/ attributes: { 'sentry.op': 'ignored-op' } },
    () => {},
  ),
  res.send({ response: 'response 1' });
});

Sentry.setupExpressErrorHandler(app);

startExpressServerAndSendPortToRunner(app);
